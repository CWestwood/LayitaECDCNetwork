#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("../../layita-app/node_modules/@supabase/supabase-js");

const repoRoot = path.resolve(__dirname, "../..");
const defaultLedger = path.join(repoRoot, ".local-backups", "phase-2-resolution-ledger-e93ea2bb2b6d.json");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const actorIndex = args.indexOf("--actor");
const actorId = actorIndex >= 0 ? args[actorIndex + 1] : null;
const fileArg = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--actor");
const ledgerPath = path.resolve(fileArg || defaultLedger);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function uuidOrNull(value, field, errors) {
  if (value === null || value === undefined || value === "") return null;
  if (!UUID_RE.test(String(value))) {
    errors.push(`${field} is not a UUID`);
    return null;
  }
  return String(value).toLowerCase();
}

function uuidArray(value, field, errors) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map((item) => uuidOrNull(item, field, errors)).filter(Boolean))];
}

async function existingIds(client, table, ids) {
  const found = new Set();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    if (!batch.length) continue;
    const { data, error } = await client.from(table).select("id").in("id", batch);
    if (error) throw new Error(`${table} validation failed: ${error.message}`);
    for (const row of data || []) found.add(row.id);
  }
  return found;
}

async function main() {
  if (!fs.existsSync(ledgerPath)) throw new Error(`Ledger not found: ${ledgerPath}`);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  if (!Array.isArray(ledger.entries)) throw new Error("Ledger entries must be an array");

  const errors = [];
  const rows = ledger.entries.map((entry, index) => {
    const canonical = entry.canonical || {};
    const sourceIdentity = uuidOrNull(entry.source_identity, `entries[${index}].source_identity`, errors);
    const practitioners = uuidArray(canonical.practitioner_keys, `entries[${index}].canonical.practitioner_keys`, errors);
    return {
      source_identity: sourceIdentity,
      source_fingerprint: String(entry.source_fingerprint || ""),
      canonical_ecdc_id: uuidOrNull(canonical.ecdc_key, `entries[${index}].canonical.ecdc_key`, errors),
      canonical_practitioner_ids: practitioners,
      responsible_staff_user_id: uuidOrNull(
        canonical.responsible_staff_user_id,
        `entries[${index}].canonical.responsible_staff_user_id`,
        errors,
      ),
      reason_code: String(entry.reason_code || ""),
      accepted_exception: entry.accepted_exception || null,
      decision: canonical,
      reviewer: entry.reviewer || null,
      reviewed_at: entry.reviewed_at || null,
      source_sha256: String(ledger.source_sha256 || ""),
      imported_by: actorId,
    };
  });

  const duplicateSources = rows.length - new Set(rows.map((row) => row.source_identity)).size;
  const duplicateFingerprints = rows.length - new Set(rows.map((row) => row.source_fingerprint)).size;
  if (duplicateSources) errors.push(`${duplicateSources} duplicate source identities`);
  if (duplicateFingerprints) errors.push(`${duplicateFingerprints} duplicate source fingerprints`);
  rows.forEach((row, index) => {
    if (!row.source_fingerprint) errors.push(`entries[${index}].source_fingerprint is empty`);
    if (!row.reason_code) errors.push(`entries[${index}].reason_code is empty`);
  });
  if (actorId && !UUID_RE.test(actorId)) errors.push("--actor must be a UUID");
  if (errors.length) throw new Error(`Ledger validation failed:\n- ${errors.join("\n- ")}`);

  const env = { ...readEnv(path.join(repoRoot, ".env")), ...process.env };
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });

  const practitionerIds = [...new Set(rows.flatMap((row) => row.canonical_practitioner_ids))];
  const ecdcIds = [...new Set(rows.map((row) => row.canonical_ecdc_id).filter(Boolean))];
  const profileIds = [...new Set(rows.map((row) => row.responsible_staff_user_id).filter(Boolean))];
  const [practitioners, ecdcs, profiles] = await Promise.all([
    existingIds(client, "practitioners", practitionerIds),
    existingIds(client, "ecdc_list", ecdcIds),
    existingIds(client, "profiles", profileIds),
  ]);
  const missingPractitioners = practitionerIds.filter((id) => !practitioners.has(id));
  const missingEcdcs = ecdcIds.filter((id) => !ecdcs.has(id));
  const missingProfiles = profileIds.filter((id) => !profiles.has(id));

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    entries: rows.length,
    quarantined: rows.filter((row) => row.reason_code.startsWith("QUARANTINED_")).length,
    canonical_practitioners: practitionerIds.length,
    canonical_ecdcs: ecdcIds.length,
    responsible_profiles: profileIds.length,
    missing_practitioners: missingPractitioners.length,
    missing_ecdcs: missingEcdcs.length,
    missing_profiles: missingProfiles.length,
  }, null, 2));

  if (missingPractitioners.length || missingEcdcs.length || missingProfiles.length) {
    throw new Error("Ledger references missing canonical records; no rows were imported");
  }
  if (!apply) return;

  for (let start = 0; start < rows.length; start += 50) {
    const { error } = await client.from("kobo_resolution_ledger")
      .upsert(rows.slice(start, start + 50), { onConflict: "source_identity" });
    if (error) throw new Error(`Ledger import failed: ${error.message}`);
  }
  console.log(`Imported ${rows.length} reviewed resolution decisions.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
