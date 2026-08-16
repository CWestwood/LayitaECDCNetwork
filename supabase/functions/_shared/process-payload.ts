import { supabase } from "./supabase-client.ts";

type SupabaseClientLike = typeof supabase;
type Payload = Record<string, unknown>;
type Warnings = string[];

export const PROCESSOR_VERSION = "phase2-2026-08-16";

type ResolutionDecision = {
  canonical_ecdc_id: string | null;
  canonical_practitioner_ids: string[] | null;
  responsible_staff_user_id: string | null;
  reason_code: string;
  decision: Record<string, unknown>;
};

const MAPPING_OUTREACH_TYPES = new Set(["mapping", "baseline", "full_audit"]);
const LOOKUP_ONLY_TYPES = new Set([
  "support",
  "caregiver",
  "literacy",
  "literacy_promotion",
]);
const INTERESTED_OUTREACH_TYPES = new Set(["interested"]);
const UPDATE_OUTREACH_TYPES = new Set(["update", "update_ecdc_details"]);

const MISSING_CHOICE_VALUES = new Set(["", "none", "not_found", "null", "undefined"]);
const DASHED_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_HEX_RE = /^[0-9a-f]{32}$/i;

const labelCache = new Map<string, string | null>();
const LABEL_CACHE_LIMIT = 500;

/* =========================================================================
   CORE PROCESSING
   ========================================================================= */

export async function processSubmission(
  instanceId: string,
  payload: Payload,
  db: SupabaseClientLike = supabase,
) {
  const warnings: Warnings = [];
  const outreachType = textValue(payload.outreach_type).toLowerCase();
  const resolution = await loadResolutionDecision(db, instanceId, warnings);

  if (resolution?.reason_code.startsWith("QUARANTINED_")) {
    return {
      status: "quarantined",
      warnings,
      provenance: {
        processor_version: PROCESSOR_VERSION,
        resolution_reason_code: resolution.reason_code,
      },
    };
  }

  const [
    dataCapturerId,
    groupId,
    transportTypeLabel,
    outreachTypeLabel,
    happenedLabel,
    didInsteadLabel,
    groupLabel,
  ] = await Promise.all([
    resolveDataCapturer(db, payload, warnings, resolution?.responsible_staff_user_id ?? null),
    resolveGroup(db, payload),
    getLabel(db, "transport", payload.transport_type),
    getLabel(db, "outreach_type", outreachType),
    getLabel(db, "yesno_other", payload.happened),
    getLabel(db, "vk2fa82", payload.What_did_you_do_instead),
    getLabel(db, "group", payload.group),
  ]);

  let primaryPractitionerId: string | null = null;
  let ecdcId: string | null = null;
  const resolvedPractitionerIds = resolution?.canonical_practitioner_ids ?? [];
  const resolvedPrimaryPractitionerId = resolvedPractitionerIds[0] ?? null;

  if (MAPPING_OUTREACH_TYPES.has(outreachType) || UPDATE_OUTREACH_TYPES.has(outreachType)) {
    ecdcId = await handleEcdcSync(db, payload, warnings, resolution?.canonical_ecdc_id ?? null);
    primaryPractitionerId = await handlePractitionerSync(
      db, payload, ecdcId, groupId, groupLabel, warnings, resolvedPrimaryPractitionerId,
    );
    await handleTrainingSync(db, payload, primaryPractitionerId, warnings);
  } else if (INTERESTED_OUTREACH_TYPES.has(outreachType)) {
    primaryPractitionerId = await handleInterestedPractitionerSync(
      db, payload, groupId, groupLabel, warnings, resolvedPrimaryPractitionerId,
    );
  } else if (LOOKUP_ONLY_TYPES.has(outreachType)) {
    primaryPractitionerId = resolvedPrimaryPractitionerId ??
      await lookupPractitionerOnly(db, payload, instanceId, warnings);
  } else {
    warnings.push(`Unrecognized outreach type: "${outreachType}" - visit recorded without practitioner link`);
  }

  const transportCost = safePositiveNumeric(payload.transport_cost, "transport_cost", warnings);
  const transportKm = safePositiveNumeric(payload.km_logged, "transport_km", warnings);

  const visitRecord = {
    date: payload.outreach_date || null,
    data_capturer_id: dataCapturerId,
    outreach_type: outreachTypeLabel ?? outreachType,
    comments: payload.comments ?? null,
    outreach_happened: happenedLabel,
    did_instead: didInsteadLabel ?? payload.What_did_you_do_instead ?? payload.something_else ?? null,
    transport_type: transportTypeLabel,
    transport_cost: transportCost,
    transport_km: transportKm,
    practitioner_id: primaryPractitionerId,
    parents_enrolled: safeInt(payload["support/parents_enrolled"]),
    parents_trained: safeInt(payload["support/parents_present"]),
    children_books: safeInt(payload["support/bookdash_children"]),
    books_per_child: safeInt(payload["support/bookdash_perchild"]),
    books_to_practitioner: safeInt(payload["support/bookdash_practitioner"]),
    photos_taken: Boolean(payload["mapping/photo_site"]),
    kobo_instance_id: instanceId,
    source: "kobo",
    people_reached: safeInt(payload.Number_of_people_reached),
  };

  const { data: visitData, error: visitError } = await db
    .from("outreach_visits")
    .upsert(visitRecord, { onConflict: "kobo_instance_id" })
    .select("id")
    .single();

  if (visitError) {
    console.error("FATAL: visit upsert failed:", visitError);
    return {
      status: "failed",
      warnings,
      error: `Visit upsert failed: ${visitError.message}`,
    };
  }

  const participantIds = Array.from(new Set([
    primaryPractitionerId,
    ...resolvedPractitionerIds,
  ].filter((id): id is string => Boolean(id))));
  await syncVisitParticipants(db, visitData.id, primaryPractitionerId, participantIds, warnings);
  await syncVisitSource(db, visitData.id, instanceId, warnings);

  return {
    status: warnings.length > 0 ? "partial" : "success",
    visitId: visitData.id,
    warnings,
    provenance: {
      processor_version: PROCESSOR_VERSION,
      resolution_reason_code: resolution?.reason_code ?? null,
      participant_count: participantIds.length,
    },
  };
}

/* =========================================================================
   HELPERS: LABEL LOOKUPS
   ========================================================================= */

async function getLabel(db: SupabaseClientLike, list: string, value: unknown) {
  const normalizedValue = textValue(value);
  if (!normalizedValue) return null;

  const key = `${list}:${normalizedValue}`;
  if (labelCache.has(key)) return labelCache.get(key) ?? normalizedValue;

  const { data } = await db
    .from("kobo_label")
    .select("label")
    .eq("list_name", list)
    .eq("name", normalizedValue)
    .maybeSingle();

  const label = data?.label ?? normalizedValue;
  if (labelCache.size >= LABEL_CACHE_LIMIT) {
    const oldestKey = labelCache.keys().next().value;
    if (oldestKey) labelCache.delete(oldestKey);
  }
  labelCache.set(key, label);
  return label;
}

function parseMultiSelect(v: unknown) {
  if (!v) return [];
  return String(v).split(" ").filter(Boolean);
}

/* =========================================================================
   HELPERS: NUMERIC COERCION
   ========================================================================= */

function safeInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function safeFloat(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

function safePositiveNumeric(value: unknown, fieldName: string, warnings: Warnings) {
  const n = safeFloat(value);
  if (n === null) return null;
  if (n < 0) {
    warnings.push(`${fieldName} was negative (${n}) - stored as null`);
    return null;
  }
  return n;
}

/* =========================================================================
   HELPERS: REFERENCE RESOLUTION
   ========================================================================= */

async function resolveDataCapturer(
  db: SupabaseClientLike,
  payload: Payload,
  warnings: Warnings,
  resolvedProfileId: string | null,
) {
  if (resolvedProfileId) {
    const { data: profile, error } = await db
      .from("profiles")
      .select("layita_staff_id")
      .eq("id", resolvedProfileId)
      .maybeSingle();
    if (error) warnings.push(`Ledger staff lookup failed: ${error.message}`);
    if (profile?.layita_staff_id) return profile.layita_staff_id;
  }
  if (!payload.data_capturer) return null;

  const staffName = await getLabel(db, "layitastaff", payload.data_capturer);
  const { data: staff } = await db
    .from("layita_staff")
    .select("id")
    .ilike("name", staffName ?? "")
    .maybeSingle();

  if (!staff) {
    warnings.push(`Data capturer "${payload.data_capturer}" not found in layita_staff`);
    return null;
  }

  return staff.id;
}

async function resolveGroup(db: SupabaseClientLike, payload: Payload) {
  if (!payload.group) return null;

  const groupName = await getLabel(db, "group", payload.group);
  const { data: group } = await db
    .from("groups")
    .select("id")
    .ilike("group_name", groupName ?? "")
    .maybeSingle();

  return group?.id ?? null;
}

/* =========================================================================
   HELPERS: ECDC / PRACTITIONER SYNC
   ========================================================================= */

async function handleEcdcSync(
  db: SupabaseClientLike,
  payload: Payload,
  warnings: Warnings,
  resolvedEcdcId: string | null,
) {
  const selectedValue = firstText(payload, [
    "mapping/ecdc_name_link",
    "ecdc_name",
    "ecdc_name_link",
  ]);
  const newName = firstText(payload, ["mapping/ecdc_name_link_new", "ecdc_name_link_new"]);
  const selectedIsMissing = isMissingChoice(selectedValue);
  const selectedUuid = canonicalUuid(selectedValue);

  let ecdc: { id: string; name?: string | null } | null = null;
  let name: string | null = selectedIsMissing ? newName : selectedValue;

  if (resolvedEcdcId) {
    const { data, error } = await db.from("ecdc_list").select("id, name").eq("id", resolvedEcdcId).maybeSingle();
    if (error) warnings.push(`Ledger ECDC lookup failed: ${error.message}`);
    if (data) {
      ecdc = data;
      name = newName || data.name || name;
    }
  }

  if (!ecdc && selectedUuid) {
    ecdc = await findRecordByExternalKey(db, "ecdc_list", selectedUuid, selectedValue, warnings, "ECDC");
    name = newName || ecdc?.name || null;
    if (!ecdc && !newName) {
      warnings.push(`ECDC selector "${selectedValue}" looked like an identifier but did not match an ECDC`);
      await logUnmatched(db, textValue(payload._uuid) || null, "mapping/ecdc_name_link", selectedValue, warnings);
      return null;
    }
  } else if (!ecdc && !selectedIsMissing && selectedValue) {
    const { data } = await db.from("ecdc_list").select("id, name").ilike("name", selectedValue).maybeSingle();
    ecdc = data;
  }

  if (!name || looksLikeIdentifier(name)) {
    warnings.push("No usable ECDC name found in mapping/update payload - ECDC not synced");
    return ecdc?.id ?? null;
  }

  const ecdcData: Record<string, unknown> = { name };
  assignIfPresent(ecdcData, "area", payload, ["mapping/area", "area"]);
  assignIfPresent(ecdcData, "number_children", payload, ["mapping/number_children", "number_children"]);
  assignIfPresent(ecdcData, "chief", payload, [
    "mapping/chief",
    "chief",
    "mapping/What_is_the_name_of_your_Chief",
  ]);
  assignIfPresent(ecdcData, "headman", payload, [
    "mapping/headman",
    "headman",
    "mapping/What_is_the_name_of_your_Headman",
  ]);
  assignBooleanIfPresent(ecdcData, "dsd_registered", payload, ["mapping/dsd_registered", "dsd_registered"]);
  assignBooleanIfPresent(ecdcData, "dsd_funded", payload, ["mapping/dsd_funded", "dsd_funded"]);
  assignLocationIfPresent(ecdcData, payload, warnings);

  if (ecdc) {
    const { error } = await db.from("ecdc_list").update(ecdcData).eq("id", ecdc.id);
    if (error) warnings.push(`ECDC update failed for "${name}": ${error.message}`);
    return ecdc.id;
  }

  const { data: newEcdc, error } = await db
    .from("ecdc_list")
    .insert({ ...ecdcData, id: crypto.randomUUID() })
    .select("id")
    .single();

  if (error) {
    warnings.push(`ECDC insert failed for "${name}": ${error.message}`);
    return null;
  }

  return newEcdc.id;
}

async function handlePractitionerSync(
  db: SupabaseClientLike,
  payload: Payload,
  ecdcFkId: string | null,
  groupId: string | null,
  groupLabel: string | null,
  warnings: Warnings,
  resolvedPractitionerId: string | null,
) {
  return upsertPractitioner(db, payload, {
    ecdcFkId,
    groupId,
    groupLabel,
    warnings,
    status: null,
    preferNewName: false,
    resolvedPractitionerId,
  });
}

async function handleInterestedPractitionerSync(
  db: SupabaseClientLike,
  payload: Payload,
  groupId: string | null,
  groupLabel: string | null,
  warnings: Warnings,
  resolvedPractitionerId: string | null,
) {
  return upsertPractitioner(db, payload, {
    ecdcFkId: null,
    groupId,
    groupLabel,
    warnings,
    status: "interested",
    preferNewName: true,
    resolvedPractitionerId,
  });
}

async function upsertPractitioner(
  db: SupabaseClientLike,
  payload: Payload,
  options: {
    ecdcFkId: string | null;
    groupId: string | null;
    groupLabel: string | null;
    warnings: Warnings;
    status: string | null;
    preferNewName: boolean;
    resolvedPractitionerId: string | null;
  },
) {
  const { ecdcFkId, groupId, groupLabel, warnings, status, preferNewName, resolvedPractitionerId } = options;
  const selectedValue = textValue(payload.ecdc_practitioner);
  const newName = textValue(payload.practitioner_new);
  const selectedIsMissing = isMissingChoice(selectedValue);
  const selectedUuid = canonicalUuid(selectedValue);

  let practitioner: { id: string; name?: string | null } | null = null;
  let name: string | null = preferNewName ? newName : selectedIsMissing ? newName : selectedValue;

  if (resolvedPractitionerId) {
    const { data, error } = await db
      .from("practitioners").select("id, name").eq("id", resolvedPractitionerId).maybeSingle();
    if (error) warnings.push(`Ledger practitioner lookup failed: ${error.message}`);
    if (data) {
      practitioner = data;
      name = newName || data.name || name;
    }
  }

  if (!practitioner && !selectedIsMissing && selectedUuid) {
    practitioner = await findRecordByExternalKey(
      db,
      "practitioners",
      selectedUuid,
      selectedValue,
      warnings,
      "Practitioner",
    );
    name = newName || practitioner?.name || null;
    if (!practitioner && !newName) {
      warnings.push(`Practitioner selector "${selectedValue}" looked like an identifier but did not match a practitioner`);
      await logUnmatched(db, textValue(payload._uuid) || null, "ecdc_practitioner", selectedValue, warnings);
      return null;
    }
  } else if (!practitioner && !selectedIsMissing && selectedValue) {
    const { data } = await db.from("practitioners").select("id, name").ilike("name", selectedValue).maybeSingle();
    practitioner = data;
  }

  if (!name || looksLikeIdentifier(name)) {
    warnings.push("No usable practitioner name found in payload");
    return practitioner?.id ?? null;
  }

  if (!practitioner) {
    const { data: similar } = await db.rpc("find_similar_practitioners", { search_name: name });
    if (similar && similar.length > 0) {
      warnings.push(
        `Practitioner "${name}" is new but similar names exist: ` +
          similar.map((s: { name: string; similarity: number }) => `"${s.name}" (${Math.round(s.similarity * 100)}%)`).join(", ") +
          " - created new record; review for duplicates",
      );
    }
  }

  const practitionerData: Record<string, unknown> = { name };
  assignIfPresent(practitionerData, "contact_number1", payload, [
    "mapping/practitioner_number_1",
    "practitioner_number_1",
  ]);
  assignIfPresent(practitionerData, "contact_number2", payload, [
    "mapping/practitioner_number_2",
    "practitioner_number_2",
  ]);
  assignBooleanIfPresent(practitionerData, "has_whatsapp", payload, [
    "mapping/practitioner_whatsapp",
    "practitioner_whatsapp",
  ]);
  assignBooleanIfPresent(practitionerData, "dsd_registered", payload, ["mapping/dsd_registered", "dsd_registered"]);
  assignBooleanIfPresent(practitionerData, "dsd_funded", payload, ["mapping/dsd_funded", "dsd_funded"]);
  if (groupId) practitionerData.group_id = groupId;
  if (groupLabel) practitionerData.group = groupLabel;
  if (ecdcFkId) practitionerData.ecdc_id = ecdcFkId;
  if (status) practitionerData.status = status;

  if (practitioner) {
    const { error } = await db.from("practitioners").update(practitionerData).eq("id", practitioner.id);
    if (error) warnings.push(`Practitioner update failed for "${name}": ${error.message}`);
    return practitioner.id;
  }

  const { data: newPractitioner, error } = await db.from("practitioners").insert(practitionerData).select("id").single();
  if (error) {
    warnings.push(`Practitioner insert failed for "${name}": ${error.message}`);
    return null;
  }

  return newPractitioner.id;
}

async function handleTrainingSync(
  db: SupabaseClientLike,
  payload: Payload,
  practitionerId: string | null,
  warnings: Warnings,
) {
  if (!practitionerId) return;
  if (!payload["mapping/training_yn"] && !payload.training_yn) return;

  const prevTraining = parseMultiSelect(payload["mapping/training_prev"] ?? payload.training_prev);
  const trainingData = {
    id: practitionerId,
    smart_start_ever: prevTraining.includes("smartstart"),
    first_aid_ever: prevTraining.includes("firstaid"),
    level4_ever: prevTraining.includes("level4"),
    level5_ever: prevTraining.includes("level5"),
    wordworks03_ever: prevTraining.includes("ww03"),
    wordworks35_ever: prevTraining.includes("ww35"),
    littlestars_ever: prevTraining.includes("littlestars"),
    other: payload["mapping/training_prev_other"] || payload.training_prev_other || null,
  };

  const { error } = await db.from("training").upsert(trainingData, { onConflict: "id" });
  if (error) warnings.push(`Training sync failed for practitioner ${practitionerId}: ${error.message}`);
}

async function lookupPractitionerOnly(
  db: SupabaseClientLike,
  payload: Payload,
  instanceId: string,
  warnings: Warnings,
) {
  const rawValue = textValue(payload.ecdc_practitioner);
  if (isMissingChoice(rawValue)) {
    warnings.push("No practitioner value provided for lookup-only visit");
    await logUnmatched(db, instanceId, "ecdc_practitioner", rawValue || null, warnings);
    return null;
  }

  const canonical = canonicalUuid(rawValue);
  if (canonical) {
    const practitioner = await findRecordByExternalKey(db, "practitioners", canonical, rawValue, warnings, "Practitioner");
    if (practitioner) return practitioner.id;

    warnings.push(`Practitioner identifier "${rawValue}" did not match any practitioner. Logged to kobo_unmatched.`);
    await logUnmatched(db, instanceId, "ecdc_practitioner", rawValue, warnings);
    return null;
  }

  const { data: byName } = await db.from("practitioners").select("id, name").ilike("name", rawValue).maybeSingle();
  if (byName) {
    warnings.push(`Practitioner resolved by name fallback for value "${rawValue}" - consider updating Kobo form to use UUID`);
    return byName.id;
  }

  const { data: similar } = await db.rpc("find_similar_practitioners", { search_name: rawValue });
  const similarNames = similar && similar.length > 0
    ? similar.map((s: { name: string }) => s.name).join(", ")
    : "none";

  warnings.push(`Practitioner "${rawValue}" not found. Similar: [${similarNames}]. Logged to kobo_unmatched.`);
  await logUnmatched(db, instanceId, "ecdc_practitioner", rawValue, warnings);
  return null;
}

async function loadResolutionDecision(
  db: SupabaseClientLike,
  instanceId: string,
  warnings: Warnings,
): Promise<ResolutionDecision | null> {
  const { data, error } = await db
    .from("kobo_resolution_ledger")
    .select("canonical_ecdc_id, canonical_practitioner_ids, responsible_staff_user_id, reason_code, decision")
    .eq("source_identity", instanceId)
    .maybeSingle();
  if (error) {
    warnings.push(`Resolution-ledger lookup failed: ${error.message}`);
    return null;
  }
  return data as ResolutionDecision | null;
}

async function syncVisitParticipants(
  db: SupabaseClientLike,
  visitId: string,
  primaryPractitionerId: string | null,
  practitionerIds: string[],
  warnings: Warnings,
) {
  if (practitionerIds.length === 0) return;
  const rows = practitionerIds.map((practitionerId) => ({
    visit_id: visitId,
    practitioner_id: practitionerId,
    participation_role: practitionerId === primaryPractitionerId ? "primary" : "additional",
  }));
  const { error } = await db
    .from("outreach_visit_practitioners")
    .upsert(rows, { onConflict: "visit_id,practitioner_id" });
  if (error) warnings.push(`Visit participant sync failed: ${error.message}`);
}

async function syncVisitSource(
  db: SupabaseClientLike,
  visitId: string,
  instanceId: string,
  warnings: Warnings,
) {
  const { error } = await db.from("outreach_visit_sources").upsert({
    visit_id: visitId,
    source_system: "kobo",
    external_id: instanceId,
    original_visit_id: visitId,
  }, { onConflict: "source_system,external_id" });
  if (error) warnings.push(`Visit source-lineage sync failed: ${error.message}`);
}

/* =========================================================================
   HELPERS: IDENTIFIERS + FIELD MAPPING
   ========================================================================= */

function textValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function firstText(payload: Payload, keys: string[]) {
  for (const key of keys) {
    const value = textValue(payload[key]);
    if (value) return value;
  }
  return "";
}

function isMissingChoice(value: unknown) {
  return MISSING_CHOICE_VALUES.has(textValue(value).toLowerCase());
}

function canonicalUuid(value: unknown) {
  const raw = textValue(value).replace(/^uuid:/i, "");
  if (DASHED_UUID_RE.test(raw)) return raw.toLowerCase();
  if (!COMPACT_HEX_RE.test(raw)) return null;

  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20),
  ].join("-").toLowerCase();
}

function looksLikeIdentifier(value: unknown) {
  const raw = textValue(value).replace(/^uuid:/i, "");
  return DASHED_UUID_RE.test(raw) || COMPACT_HEX_RE.test(raw);
}

async function findRecordByExternalKey(
  db: SupabaseClientLike,
  table: "ecdc_list" | "practitioners",
  canonical: string,
  rawValue: string,
  warnings: Warnings,
  label: string,
): Promise<{ id: string; name: string | null } | null> {
  const { data: byCanonical, error: canonicalError } = await db
    .from(table)
    .select("id, name")
    .eq("id", canonical)
    .maybeSingle();

  if (canonicalError) warnings.push(`${label} UUID lookup failed: ${canonicalError.message}`);
  if (byCanonical) return byCanonical as { id: string; name: string | null };

  const raw = textValue(rawValue).replace(/^uuid:/i, "").toLowerCase();
  if (!COMPACT_HEX_RE.test(raw)) return null;

  const rpcName = table === "practitioners" ? "resolve_practitioner_external_id" : "resolve_ecdc_external_id";
  const { data: byExternalKey, error: rpcError } = await db.rpc(rpcName, { raw_value: raw }).maybeSingle();
  if (byExternalKey) return byExternalKey as { id: string; name: string | null };
  if (rpcError && rpcError.code !== "PGRST202") {
    warnings.push(`${label} external-key lookup failed: ${rpcError.message}`);
  }
  return null;
}

function assignIfPresent(target: Record<string, unknown>, targetKey: string, payload: Payload, sourceKeys: string[]) {
  for (const key of sourceKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      target[targetKey] = payload[key];
      return;
    }
  }
}

function assignBooleanIfPresent(target: Record<string, unknown>, targetKey: string, payload: Payload, sourceKeys: string[]) {
  for (const key of sourceKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      target[targetKey] = payload[key] === "yes" || payload[key] === true;
      return;
    }
  }
}

function assignLocationIfPresent(target: Record<string, unknown>, payload: Payload, warnings: Warnings) {
  const location = firstText(payload, ["mapping/location", "location"]);
  if (!location) return;

  const coords = location.split(" ");
  if (coords.length < 2) {
    warnings.push(`ECDC location coords malformed: "${location}"`);
    return;
  }

  const lat = parseFloat(coords[0]);
  const lng = parseFloat(coords[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    warnings.push(`ECDC location coords malformed: "${location}"`);
    return;
  }

  target.latitude = lat;
  target.longitude = lng;
}

/* =========================================================================
   HELPERS: UNMATCHED + STATUS LOGGING
   ========================================================================= */

async function logUnmatched(
  db: SupabaseClientLike,
  instanceId: string | null,
  field: string,
  rawValue: unknown,
  warnings: Warnings,
) {
  if (!instanceId) {
    warnings.push(`Could not log unmatched ${field}: missing instance_id`);
    return;
  }

  const { error } = await db.rpc("record_kobo_unmatched", {
    p_instance_id: instanceId,
    p_field: field,
    p_raw_value: rawValue === null || rawValue === undefined ? null : String(rawValue),
  });

  if (error) warnings.push(`Failed to log unmatched record: ${error.message}`);
}

export async function markProcessed(
  instanceId: string,
  status: string,
  errorMessage?: string,
  warnings?: string[],
) {
  await supabase.from("kobo_processed").upsert({
    instance_id: instanceId,
    status,
    error_message: errorMessage ?? null,
    warnings: warnings && warnings.length > 0 ? warnings.join("\n") : null,
    warning_details: warnings && warnings.length > 0 ? warnings : null,
    processor_version: PROCESSOR_VERSION,
    processed_at: new Date().toISOString(),
  }, {
    onConflict: "instance_id",
  });
}

export const __testing = {
  canonicalUuid,
  isMissingChoice,
  looksLikeIdentifier,
  safeInt,
  safePositiveNumeric,
};
