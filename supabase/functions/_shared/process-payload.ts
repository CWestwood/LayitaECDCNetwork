import { supabase } from "./supabase-client.ts";
// Define the constants missing from the original file
const MAPPING_OUTREACH_TYPES = [
  "mapping",
  "baseline",
  "full_audit"
];
const LOOKUP_ONLY_TYPES = [
  "support",
  "caregiver",
  "literacy"
];
/* =========================================================================
   CORE PROCESSING
   ========================================================================= */ export async function processSubmission(instanceId, payload) {
  const warnings = [];
  const outreachType = String(payload.outreach_type ?? "").trim();
  // --- Resolve shared lookup values in parallel ---
  const [dataCapturerId, groupId, transportTypeLabel, outreachTypeLabel, happenedLabel, groupLabel] = await Promise.all([
    resolveDataCapturer(payload, warnings),
    resolveGroup(payload),
    getLabel("transport", payload.transport_type),
    getLabel("outreach_type", outreachType),
    getLabel("yesno_other", payload["happened"]),
    getLabel("group", payload["group"])
  ]);
  // --- Workflow-specific practitioner/ECDC resolution ---
  let primaryPractitionerId = null;
  let ecdcId = null;
  if (MAPPING_OUTREACH_TYPES.includes(outreachType)) {
    ecdcId = await handleEcdcSync(payload, warnings);
    primaryPractitionerId = await handlePractitionerSync(payload, ecdcId, groupId, groupLabel, warnings);
    await handleTrainingSync(payload, primaryPractitionerId, warnings);
  } else if (LOOKUP_ONLY_TYPES.includes(outreachType)) {
    primaryPractitionerId = await lookupPractitionerOnly(payload, instanceId, warnings);
  } else {
    warnings.push(`Unrecognized outreach type: "${outreachType}" — visit recorded without practitioner link`);
  }
  // --- Build visit record, coercing and validating numeric fields ---
  const transportCost = safePositiveNumeric(payload.transport_cost, "transport_cost", warnings);
  const transportKm = safePositiveNumeric(payload.km_logged, "transport_km", warnings);
  const visitRecord = {
    date: payload.outreach_date,
    data_capturer_id: dataCapturerId,
    outreach_type: outreachTypeLabel,
    comments: payload.comments ?? null,
    outreach_happened: happenedLabel,
    did_instead: payload.something_else ?? null,
    transport_type: transportTypeLabel,
    transport_cost: transportCost,
    transport_km: transportKm,
    practitioner_id: primaryPractitionerId,
    parents_enrolled: safeInt(payload["support/parents_enrolled"]),
    parents_trained: safeInt(payload["support/parents_present"]),
    children_books: safeInt(payload["support/bookdash_children"]),
    books_per_child: safeInt(payload["support/bookdash_perchild"]),
    books_to_practitioner: safeInt(payload["support/bookdash_practitioner"]),
    photos_taken: !!payload["mapping/photo_site"],
    // Provenance tracking
    kobo_instance_id: instanceId,
    source: "kobo"
  };
  const { data: visitData, error: visitError } = await supabase.from("outreach_visits").insert(visitRecord).select("id").single();
  if (visitError) {
    console.error("FATAL: visit insert failed:", visitError);
    return {
      status: "failed",
      warnings,
      error: `Visit insert failed: ${visitError.message}`
    };
  }
  // A visit with unresolved practitioner is partial, not a failure
  const finalStatus = warnings.length > 0 ? "partial" : "success";
  return {
    status: finalStatus,
    visitId: visitData.id,
    warnings
  };
}
/* =========================================================================
   HELPERS: LABEL LOOKUPS
   ========================================================================= */ async function getLabel(list, value) {
  if (!value) return null;
  const { data } = await supabase.from("kobo_label").select("label").eq("list_name", list).eq("name", value).maybeSingle();
  return data?.label ?? value;
}
function parseMultiSelect(v) {
  if (!v) return [];
  return String(v).split(" ").filter(Boolean);
}
/* =========================================================================
   HELPERS: NUMERIC COERCION
   ========================================================================= */ function safeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}
function safeFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}
/**
 * Parses a numeric field and enforces the DB check constraint (>= 0).
 * Logs a warning and returns null rather than letting Postgres reject the row.
 */ function safePositiveNumeric(value, fieldName, warnings) {
  const n = safeFloat(value);
  if (n === null) return null;
  if (n < 0) {
    warnings.push(`${fieldName} was negative (${n}) — stored as null`);
    return null;
  }
  return n;
}
/* =========================================================================
   HELPERS: REFERENCE RESOLUTION
   ========================================================================= */ async function resolveDataCapturer(payload, warnings) {
  if (!payload.data_capturer) return null;
  const staffName = await getLabel("layitastaff", payload.data_capturer);
  const { data: staff } = await supabase.from("layita_staff").select("id").ilike("name", staffName ?? "").maybeSingle();
  if (!staff) {
    warnings.push(`Data capturer "${payload.data_capturer}" not found in layita_staff`);
    return null;
  }
  return staff.id;
}
async function resolveGroup(payload) {
  if (!payload["group"]) return null;
  const groupName = await getLabel("group", payload["group"]);
  const { data: group } = await supabase.from("groups").select("id").ilike("group_name", groupName ?? "").maybeSingle();
  return group?.id ?? null;
}
/* =========================================================================
   HELPERS: ECDC / PRACTITIONER SYNC
   ========================================================================= */ async function handleEcdcSync(payload, warnings) {
  let name = payload["mapping/ecdc_name_link"];
  if (!name || name === "not_found" || name === "none") {
    name = payload["mapping/ecdc_name_link_new"];
  }
  if (!name) {
    warnings.push("No ECDC name found in mapping payload — ECDC not synced");
    return null;
  }
  const { data: ecdc } = await supabase.from("ecdc_list").select("id").ilike("name", name).maybeSingle();
  const ecdcData = {
    name
  };
  if ("mapping/area" in payload) ecdcData.area = payload["mapping/area"];
  if ("mapping/number_children" in payload) ecdcData.number_children = payload["mapping/number_children"];
  if ("mapping/chief" in payload) ecdcData.chief = payload["mapping/chief"];
  if ("mapping/headman" in payload) ecdcData.headman = payload["mapping/headman"];
  if ("mapping/dsd_registered" in payload) ecdcData.dsd_registered = payload["mapping/dsd_registered"] === "yes";
  if ("mapping/dsd_funded" in payload) ecdcData.dsd_funded = payload["mapping/dsd_funded"] === "yes";
  if (payload["mapping/location"]) {
    const coords = String(payload["mapping/location"]).split(" ");
    if (coords.length >= 2) {
      const lat = parseFloat(coords[0]);
      const lng = parseFloat(coords[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        ecdcData.latitude = lat;
        ecdcData.longitude = lng;
      } else {
        warnings.push(`ECDC location coords malformed: "${payload["mapping/location"]}"`);
      }
    }
  }
  if (ecdc) {
    const { error } = await supabase.from("ecdc_list").update(ecdcData).eq("id", ecdc.id);
    if (error) warnings.push(`ECDC update failed for "${name}": ${error.message}`);
    return ecdc.id;
  } else {
    const { data: newEcdc, error } = await supabase.from("ecdc_list").insert({
      ...ecdcData,
      id: crypto.randomUUID()
    }).select("id").single();
    if (error) {
      warnings.push(`ECDC insert failed for "${name}": ${error.message}`);
      return null;
    }
    return newEcdc.id;
  }
}
async function handlePractitionerSync(payload, ecdcFkId, groupId, groupLabel, warnings) {
  let name = payload.ecdc_practitioner;
  if (!name || name === "not_found" || name === "none") {
    name = payload.practitioner_new;
  }
  if (!name) {
    warnings.push("No practitioner name found in mapping payload");
    return null;
  }
  // --- Similarity check: warn if near-duplicates exist ---
  const { data: similar } = await supabase.rpc("find_similar_practitioners", {
    search_name: name
  });
  const { data: prac } = await supabase.from("practitioners").select("id").ilike("name", name).maybeSingle();
  // If no exact match but similar records exist, flag for admin review
  if (!prac && similar && similar.length > 0) {
    warnings.push(`Practitioner "${name}" is new but similar names exist: ` + similar.map((s)=>`"${s.name}" (${Math.round(s.similarity * 100)}%)`).join(", ") + ` — created new record; review for duplicates`);
  }
  const pracData = {
    name
  };
  if ("mapping/practitioner_number_1" in payload) pracData.contact_number1 = payload["mapping/practitioner_number_1"];
  if ("mapping/practitioner_number_2" in payload) pracData.contact_number2 = payload["mapping/practitioner_number_2"];
  if ("mapping/practitioner_whatsapp" in payload) pracData.has_whatsapp = payload["mapping/practitioner_whatsapp"] === "yes";
  if ("mapping/dsd_registered" in payload) pracData.dsd_registered = payload["mapping/dsd_registered"] === "yes";
  if ("mapping/dsd_funded" in payload) pracData.dsd_funded = payload["mapping/dsd_funded"] === "yes";
  if (groupId) pracData.group_id = groupId;
  if (groupLabel) pracData.group = groupLabel;
  if (ecdcFkId) pracData.ecdc_id = ecdcFkId;
  if (prac) {
    const { error } = await supabase.from("practitioners").update(pracData).eq("id", prac.id);
    if (error) warnings.push(`Practitioner update failed for "${name}": ${error.message}`);
    return prac.id;
  } else {
    const { data: newPrac, error } = await supabase.from("practitioners").insert(pracData).select("id").single();
    if (error) {
      warnings.push(`Practitioner insert failed for "${name}": ${error.message}`);
      return null;
    }
    return newPrac.id;
  }
}
async function handleTrainingSync(payload, practitionerId, warnings) {
  if (!practitionerId) return;
  if (!payload["mapping/training_yn"]) return;
  const prevTraining = parseMultiSelect(payload["mapping/training_prev"]);
  const trainingData = {
    id: practitionerId,
    smart_start_ever: prevTraining.includes("smartstart"),
    first_aid_ever: prevTraining.includes("firstaid"),
    level4_ever: prevTraining.includes("level4"),
    level5_ever: prevTraining.includes("level5"),
    wordworks03_ever: prevTraining.includes("ww03"),
    wordworks35_ever: prevTraining.includes("ww35"),
    littlestars_ever: prevTraining.includes("littlestars"),
    other: payload["mapping/training_prev_other"] || null
  };
  const { data: existing } = await supabase.from("training").select("id").eq("id", practitionerId).maybeSingle();
  const { error } = await supabase.from("training").upsert(trainingData, {
    onConflict: "id"
  });
  if (error) warnings.push(`Training sync failed for practitioner ${practitionerId}: ${error.message}`);
}
/**
 * For support/caregiver/literacy visits, the Kobo payload should contain the
 * practitioner's Supabase UUID directly. If it doesn't match, we log to
 * kobo_unmatched so an admin can resolve the link later.
 */ async function lookupPractitionerOnly(payload, instanceId, warnings) {
  const rawValue = payload.ecdc_practitioner;
  if (!rawValue || rawValue === "none" || rawValue === "not_found") {
    warnings.push("No practitioner value provided for lookup-only visit");
    await logUnmatched(instanceId, "ecdc_practitioner", rawValue ?? null, warnings);
    return null;
  }
  // First: try UUID direct match (expected happy path)
  const { data: byId } = await supabase.from("practitioners").select("id").eq("id", rawValue).maybeSingle();
  if (byId) return byId.id;
  // Second: fall back to name match (handles older submissions)
  const { data: byName } = await supabase.from("practitioners").select("id, name").ilike("name", rawValue).maybeSingle();
  if (byName) {
    warnings.push(`Practitioner resolved by name fallback for value "${rawValue}" — consider updating Kobo form to use UUID`);
    return byName.id;
  }
  // Third: check for near-matches to help admin resolve
  const { data: similar } = await supabase.rpc("find_similar_practitioners", {
    search_name: rawValue
  });
  const similarNames = similar && similar.length > 0 ? similar.map((s)=>s.name).join(", ") : "none";
  warnings.push(`Practitioner "${rawValue}" not found. Similar: [${similarNames}]. Logged to kobo_unmatched.`);
  await logUnmatched(instanceId, "ecdc_practitioner", rawValue, warnings);
  return null;
}
/* =========================================================================
   HELPERS: UNMATCHED + STATUS LOGGING
   ========================================================================= */ async function logUnmatched(instanceId, field, rawValue, warnings) {
  const { error } = await supabase.from("kobo_unmatched").insert({
    instance_id: instanceId,
    field,
    raw_value: rawValue
  });
  if (error) warnings.push(`Failed to log unmatched record: ${error.message}`);
}
export async function markProcessed(instanceId, status, errorMessage, warnings) {
  await supabase.from("kobo_processed").upsert({
    instance_id: instanceId,
    status,
    error_message: errorMessage ?? null,
    warnings: warnings && warnings.length > 0 ? warnings : null,
    processed_at: new Date().toISOString()
  }, {
    onConflict: "instance_id"
  });
}
