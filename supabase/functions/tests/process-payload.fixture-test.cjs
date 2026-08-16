const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("../../../layita-app/node_modules/esbuild");

const repoRoot = path.resolve(__dirname, "../../..");
const processorPath = path.join(repoRoot, "supabase/functions/_shared/process-payload.ts");

function loadProcessor(fakeSupabase) {
  let source = fs.readFileSync(processorPath, "utf8");
  source = source.replace(
    'import { supabase } from "./supabase-client.ts";',
    "const supabase = globalThis.__fakeSupabase;",
  );
  source = source.replace("export async function processSubmission", "async function processSubmission");
  source = source.replace("export async function markProcessed", "async function markProcessed");
  source = source.replace("export const __testing =", "const __testing =");
  source += "\nmodule.exports = { processSubmission, markProcessed, __testing };\n";

  const { code } = esbuild.transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });

  const previous = globalThis.__fakeSupabase;
  globalThis.__fakeSupabase = fakeSupabase;
  const module = { exports: {} };
  Function("module", "exports", "require", code)(module, module.exports, require);
  globalThis.__fakeSupabase = previous;
  return module.exports;
}

class FakeSupabase {
  constructor() {
    this.tables = {
      kobo_label: [
        { list_name: "layitastaff", name: "sive", label: "Sive" },
        { list_name: "outreach_type", name: "mapping", label: "ECDC Mapping" },
        { list_name: "outreach_type", name: "update", label: "Update ECDC Details" },
        { list_name: "outreach_type", name: "caregiver", label: "Caregiver Training" },
        { list_name: "outreach_type", name: "interested", label: "Add Practitioner Interested in joining network" },
        { list_name: "transport", name: "private", label: "Private Transport" },
        { list_name: "transport", name: "walked", label: "Walked" },
        { list_name: "yesno_other", name: "yes", label: "Yes" },
        { list_name: "vk2fa82", name: "support", label: "Practitioner Support" },
        { list_name: "group", name: "ss_1", label: "SS Group 1 (2023)" },
        { list_name: "group", name: "ss_interested", label: "Person interested in joining ECDC Database" },
      ],
      layita_staff: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Sive" }],
      groups: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", group_name: "SS Group 1 (2023)" },
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", group_name: "Person interested in joining ECDC Database" },
      ],
      profiles: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", layita_staff_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      ecdc_list: [{ id: "11111111-1111-4111-8111-111111111111", name: "Existing ECDC", area: "Old Area" }],
      practitioners: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Existing Practitioner",
          ecdc_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
      training: [],
      outreach_visits: [],
      outreach_visit_practitioners: [],
      outreach_visit_sources: [],
      outreach_attachments: [],
      kobo_unmatched: [],
      kobo_processed: [],
      kobo_resolution_ledger: [],
    };
  }

  from(table) {
    return new FakeQuery(this, table);
  }

  rpc(name, args) {
    if (name === "find_similar_practitioners") return thenable({ data: [], error: null });

    if (name === "resolve_practitioner_external_id") {
      return thenable({
        data: findByExternalKey(this.tables.practitioners, args.raw_value),
        error: null,
      });
    }

    if (name === "resolve_ecdc_external_id") {
      return thenable({
        data: findByExternalKey(this.tables.ecdc_list, args.raw_value),
        error: null,
      });
    }

    if (name === "record_kobo_unmatched") {
      const existing = this.tables.kobo_unmatched.find((row) =>
        row.instance_id === args.p_instance_id && row.field === args.p_field &&
        String(row.raw_value ?? "") === String(args.p_raw_value ?? "") && !row.resolved_at
      );
      if (existing) existing.occurrence_count = (existing.occurrence_count || 1) + 1;
      else this.tables.kobo_unmatched.push({
        id: crypto.randomUUID(), instance_id: args.p_instance_id, field: args.p_field,
        raw_value: args.p_raw_value, occurrence_count: 1,
      });
      return thenable({ data: existing?.id ?? this.tables.kobo_unmatched.at(-1).id, error: null });
    }

    return thenable({ data: null, error: { code: "PGRST202", message: "RPC not found" } });
  }
}

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
    this.conflictKey = null;
    this.limitCount = null;
  }

  select() {
    return this;
  }

  eq(key, value) {
    this.filters.push({ key, value, mode: "eq" });
    if (this.operation === "update") return Promise.resolve(this.applyUpdate());
    return this;
  }

  ilike(key, value) {
    this.filters.push({ key, value, mode: "ilike" });
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const rows = this.filteredRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single() {
    if (this.operation === "insert") return Promise.resolve(this.applyInsert());
    if (this.operation === "upsert") return Promise.resolve(this.applyUpsert());
    const rows = this.filteredRows();
    return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "No row" } });
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload, options = {}) {
    this.operation = "upsert";
    this.payload = payload;
    this.conflictKey = options.onConflict;
    return this;
  }

  then(resolve, reject) {
    if (this.operation === "insert") return Promise.resolve(this.applyInsert()).then(resolve, reject);
    if (this.operation === "upsert") return Promise.resolve(this.applyUpsert()).then(resolve, reject);
    Promise.resolve({ data: this.filteredRows(), error: null }).then(resolve, reject);
  }

  filteredRows() {
    let rows = [...this.db.tables[this.table]];
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const actual = row[filter.key];
        if (filter.mode === "eq") return String(actual) === String(filter.value);
        return String(actual ?? "").toLowerCase() === String(filter.value ?? "").toLowerCase();
      });
    }
    return typeof this.limitCount === "number" ? rows.slice(0, this.limitCount) : rows;
  }

  applyInsert() {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    const inserted = rows.map((row) => {
      const next = { ...row };
      if (!next.id && this.table === "kobo_unmatched") next.id = crypto.randomUUID();
      this.db.tables[this.table].push(next);
      return next;
    });
    return { data: Array.isArray(this.payload) ? inserted : inserted[0], error: null };
  }

  applyUpdate() {
    const rows = this.filteredRows();
    for (const row of rows) Object.assign(row, this.payload);
    return { data: rows, error: null };
  }

  applyUpsert() {
    const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
    const keys = String(this.conflictKey || "").split(",").filter(Boolean);
    const results = payloads.map((payload) => {
      let row = this.db.tables[this.table].find((candidate) =>
        keys.length > 0 && keys.every((key) => candidate[key] === payload[key])
      );
      if (row) Object.assign(row, payload);
      else {
        row = { id: crypto.randomUUID(), ...payload };
        this.db.tables[this.table].push(row);
      }
      return row;
    });
    return { data: Array.isArray(this.payload) ? results : results[0], error: null };
  }
}

function thenable(result) {
  return {
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
}

function findByExternalKey(records, rawValue) {
  const raw = String(rawValue).toLowerCase();
  return records.find((record) => {
    const id = record.id.toLowerCase();
    return id === raw || id.replace(/-/g, "") === raw || crypto.createHash("md5").update(id).digest("hex") === raw;
  }) ?? null;
}

function basePayload(overrides = {}) {
  return {
    _uuid: crypto.randomUUID(),
    start: "2026-07-07T08:00:00+02:00",
    end: "2026-07-07T08:30:00+02:00",
    outreach_date: "2026-07-07",
    data_capturer: "sive",
    outreach_type: "caregiver",
    happened: "yes",
    transport_type: "private",
    transport_cost: "120",
    km_logged: "35",
    ecdc_practitioner: "22222222-2222-4222-8222-222222222222",
    "support/parents_enrolled": "20",
    "support/parents_present": "12",
    "support/bookdash_children": "12",
    "support/bookdash_perchild": "1",
    "support/bookdash_practitioner": "2",
    "support/bookdash": "yes",
    ...overrides,
  };
}

async function run() {
  const fake = new FakeSupabase();
  const { processSubmission } = loadProcessor(fake);

  const mappingResult = await processSubmission("test-mapping", basePayload({
    outreach_type: "mapping",
    group: "ss_1",
    "mapping/ecdc_name_link": "11111111-1111-4111-8111-111111111111",
    "mapping/area": "New Area",
    "mapping/location": "-31.920722 28.656597 824.8 15.6",
    "mapping/practitioner_number_1": "0737691300",
    "mapping/practitioner_whatsapp": "yes",
    "mapping/dsd_registered": "yes",
    "mapping/dsd_funded": "no",
    "mapping/training_yn": "yes",
    "mapping/training_prev": "firstaid   level4",
    "mapping/photo_site": "ecdc-photo.jpg",
  }), fake);
  assert.equal(mappingResult.status, "success");
  assert.equal(fake.tables.ecdc_list[0].name, "Existing ECDC");
  assert.equal(fake.tables.ecdc_list[0].area, "New Area");
  assert.equal(fake.tables.practitioners[0].name, "Existing Practitioner");
  assert.equal(fake.tables.practitioners[0].dsd_registered, true);
  assert.equal(fake.tables.practitioners[0].dsd_funded, false);
  assert.equal(Object.hasOwn(fake.tables.ecdc_list[0], "dsd_registered"), false);
  assert.equal(fake.tables.training[0].first_aid_ever, true);
  assert.equal(fake.tables.training[0].level4_ever, true);
  assert.equal(Object.hasOwn(fake.tables.training[0], "smart_start_ever"), false);
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-mapping").photos_taken, true);
  const mappingVisit = fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-mapping");
  assert.equal(mappingVisit.capture_started_at, "2026-07-07T06:00:00.000Z");
  assert.equal(mappingVisit.capture_ended_at, "2026-07-07T06:30:00.000Z");
  assert.equal(mappingVisit.captured_latitude, -31.920722);
  assert.equal(mappingVisit.captured_longitude, 28.656597);
  assert.equal(mappingVisit.captured_altitude_m, 824.8);
  assert.equal(mappingVisit.captured_accuracy_m, 15.6);
  assert.equal(fake.tables.outreach_attachments.length, 1);
  assert.equal(fake.tables.outreach_attachments[0].source_filename, "ecdc-photo.jpg");

  const invalidPhoneResult = await processSubmission("test-invalid-phone", basePayload({
    outreach_type: "update",
    ecdc_name: "11111111-1111-4111-8111-111111111111",
    "mapping/practitioner_number_1": "+27 73 769 1300",
  }), fake);
  assert.equal(invalidPhoneResult.status, "partial");
  assert.equal(fake.tables.practitioners[0].contact_number1, "0737691300");

  const missedMapping = await processSubmission("test-mapping-missed", basePayload({
    outreach_type: "mapping",
    happened: "no",
    ecdc_practitioner: "",
    "mapping/ecdc_name_link": "",
  }), fake);
  assert.equal(missedMapping.status, "success");
  assert.equal(fake.tables.kobo_unmatched.length, 0);

  const missedCaregiver = await processSubmission("test-caregiver-missed", basePayload({
    happened: "no",
    ecdc_practitioner: "",
  }), fake);
  assert.equal(missedCaregiver.status, "success");
  assert.equal(fake.tables.kobo_unmatched.length, 0);

  const updateResult = await processSubmission("test-update", basePayload({
    outreach_type: "update",
    happened: "",
    ecdc_practitioner: "22222222-2222-4222-8222-222222222222",
    ecdc_name: "11111111-1111-4111-8111-111111111111",
    "mapping/details_needed": "area location",
    "mapping/area": "Updated by current form",
    "mapping/location": "-31.920722   28.656597",
  }), fake);
  assert.equal(updateResult.status, "success");
  assert.equal(fake.tables.ecdc_list[0].area, "Updated by current form");
  assert.equal(fake.tables.ecdc_list[0].latitude, -31.920722);
  assert.equal(fake.tables.ecdc_list[0].longitude, 28.656597);

  const alternativeResult = await processSubmission("test-alternative", basePayload({
    happened: "else",
    What_did_you_do_instead: "literacy_promotion",
    Number_of_people_reached: "18",
    "support/bookdash": "yes",
    "support/bookdash_children": "10",
    "support/bookdash_perchild": "2",
    "support/bookdash_practitioner": "3",
    Is_this_site_accessi_by_public_transport: "no",
  }), fake);
  assert.equal(alternativeResult.status, "success");
  const alternativeVisit = fake.tables.outreach_visits.find((v) =>
    v.kobo_instance_id === "test-alternative"
  );
  assert.equal(alternativeVisit.did_instead, "literacy_promotion");
  assert.equal(alternativeVisit.people_reached, 18);
  assert.equal(alternativeVisit.children_books, 10);
  assert.equal(alternativeVisit.books_per_child, 2);
  assert.equal(alternativeVisit.books_to_practitioner, 3);
  assert.equal(alternativeVisit.bookdash_given, true);
  assert.equal(alternativeVisit.public_transport_accessible, false);

  const compactId = "22222222222242228222222222222222";
  const compactResult = await processSubmission("test-compact", basePayload({ ecdc_practitioner: compactId }), fake);
  assert.equal(compactResult.status, "success");
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-compact").practitioner_id, "22222222-2222-4222-8222-222222222222");

  const md5Id = crypto.createHash("md5").update("22222222-2222-4222-8222-222222222222").digest("hex");
  const md5Result = await processSubmission("test-md5", basePayload({ ecdc_practitioner: md5Id }), fake);
  assert.equal(md5Result.status, "success");
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-md5").practitioner_id, "22222222-2222-4222-8222-222222222222");

  const unmatchedResult = await processSubmission("test-unmatched", basePayload({
    ecdc_practitioner: "33333333-3333-4333-8333-333333333333",
  }), fake);
  assert.equal(unmatchedResult.status, "partial");
  assert.equal(fake.tables.kobo_unmatched.length, 1);
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-unmatched").practitioner_id, null);

  const interestedResult = await processSubmission("test-interested", basePayload({
    outreach_type: "interested",
    group: "ss_interested",
    practitioner_new: "Interested Practitioner",
    ecdc_practitioner: "",
    transport_type: "walked",
    transport_cost: "",
    km_logged: "",
    "mapping/practitioner_number_1": "0712345678",
  }), fake);
  assert.equal(interestedResult.status, "success");
  assert.equal(fake.tables.practitioners.at(-1).status, "interested");
  assert.equal(fake.tables.practitioners.at(-1).name, "Interested Practitioner");

  const negativeResult = await processSubmission("test-negative", basePayload({ transport_cost: "-5" }), fake);
  assert.equal(negativeResult.status, "partial");
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-negative").transport_cost, null);

  const invalidIntegerResult = await processSubmission("test-invalid-integer", basePayload({
    "support/parents_present": "12 people",
  }), fake);
  assert.equal(invalidIntegerResult.status, "success");
  assert.equal(fake.tables.outreach_visits.find((v) =>
    v.kobo_instance_id === "test-invalid-integer"
  ).parents_trained, null);

  await processSubmission("test-compact", basePayload({ comments: "reprocessed" }), fake);
  assert.equal(fake.tables.outreach_visits.filter((v) => v.kobo_instance_id === "test-compact").length, 1);
  assert.equal(fake.tables.outreach_visits.find((v) => v.kobo_instance_id === "test-compact").comments, "reprocessed");

  const ledgerInstance = crypto.randomUUID();
  fake.tables.kobo_resolution_ledger.push({
    source_identity: ledgerInstance,
    canonical_ecdc_id: "11111111-1111-4111-8111-111111111111",
    canonical_practitioner_ids: [
      "22222222-2222-4222-8222-222222222222",
      "44444444-4444-4444-8444-444444444444",
    ],
    responsible_staff_user_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    reason_code: "MANUAL_REVIEW_EXISTING_IDENTITIES_CONFIRMED",
    decision: {},
  });
  fake.tables.practitioners.push({ id: "44444444-4444-4444-8444-444444444444", name: "Second Practitioner" });
  const ledgerResult = await processSubmission(ledgerInstance, basePayload({
    _uuid: ledgerInstance,
    ecdc_practitioner: "not-the-canonical-name",
  }), fake);
  assert.equal(ledgerResult.status, "success");
  assert.equal(ledgerResult.provenance.participant_count, 2);
  assert.equal(fake.tables.outreach_visit_practitioners.filter((row) =>
    row.visit_id === ledgerResult.visitId
  ).length, 2);

  const quarantineInstance = crypto.randomUUID();
  fake.tables.kobo_resolution_ledger.push({
    source_identity: quarantineInstance,
    canonical_ecdc_id: null,
    canonical_practitioner_ids: [],
    responsible_staff_user_id: null,
    reason_code: "QUARANTINED_MISSED_VISIT",
    decision: {},
  });
  const quarantined = await processSubmission(quarantineInstance, basePayload({ _uuid: quarantineInstance }), fake);
  assert.equal(quarantined.status, "quarantined");
  assert.equal(fake.tables.outreach_visits.some((visit) => visit.kobo_instance_id === quarantineInstance), false);

  await processSubmission("test-unmatched", basePayload({
    ecdc_practitioner: "33333333-3333-4333-8333-333333333333",
  }), fake);
  assert.equal(fake.tables.kobo_unmatched.length, 1);
  assert.equal(fake.tables.kobo_unmatched[0].occurrence_count, 2);

  console.log("process-payload fixture tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
