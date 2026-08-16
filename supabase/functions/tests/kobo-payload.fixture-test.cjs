const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("../../../layita-app/node_modules/esbuild");

const repoRoot = path.resolve(__dirname, "../../..");
const helperPath = path.join(repoRoot, "supabase/functions/_shared/kobo-payload.ts");
const schemaPath = path.join(repoRoot, "docs/kobo-form-schema.json");

const { code } = esbuild.transformSync(fs.readFileSync(helperPath, "utf8"), {
  loader: "ts",
  format: "cjs",
  target: "es2022",
});
const moduleUnderTest = { exports: {} };
Function("module", "exports", "require", code)(moduleUnderTest, moduleUnderTest.exports, require);
const { extractKoboInstanceId, isKoboPayload } = moduleUnderTest.exports;

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const paths = new Set(schema.fields.map((field) => field.path));
const field = (name) => schema.fields.find((candidate) => candidate.name === name);

assert.equal(paths.has("mapping/location"), true);
assert.equal(paths.has("support/parents_present"), true);
assert.equal(paths.has("Number_of_people_reached"), true);
assert.equal(paths.has("Is_this_site_accessi_by_public_transport"), true);
assert.deepEqual(field("outreach_type").choices.map((choice) => choice.name), [
  "mapping", "update", "caregiver", "interested",
]);
assert.deepEqual(field("What_did_you_do_instead").choices.map((choice) => choice.name), [
  "literacy_promotion", "support",
]);
assert.deepEqual(field("training_prev").choices.map((choice) => choice.name), [
  "firstaid", "level4", "level5", "other",
]);

assert.equal(extractKoboInstanceId({ _uuid: " uuid-value " }), "uuid-value");
assert.equal(extractKoboInstanceId({ "meta/instanceID": "uuid:flat-instance" }), "uuid:flat-instance");
assert.equal(extractKoboInstanceId({ _meta: { instanceID: "legacy-nested" } }), "legacy-nested");
assert.equal(extractKoboInstanceId({}), null);
assert.equal(isKoboPayload({}), true);
assert.equal(isKoboPayload([]), false);
assert.equal(isKoboPayload(null), false);

console.log("Kobo payload/schema fixture tests passed");
