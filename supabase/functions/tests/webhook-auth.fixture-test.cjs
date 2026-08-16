const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("../../../layita-app/node_modules/esbuild");

const sourcePath = path.resolve(__dirname, "../_shared/webhook-auth.ts");
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace("export function authorizeKoboWebhook", "function authorizeKoboWebhook");
source = source.replace("export const __testing =", "const __testing =");
source += "\nmodule.exports = { authorizeKoboWebhook, __testing };\n";
const { code } = esbuild.transformSync(source, { loader: "ts", format: "cjs", target: "es2022" });
const moduleObject = { exports: {} };
Function("module", "exports", "require", code)(moduleObject, moduleObject.exports, require);
const { authorizeKoboWebhook, __testing } = moduleObject.exports;

const headers = (value) => ({ get: (name) => name === "x-kobo-webhook-secret" ? value : null });

assert.deepEqual(authorizeKoboWebhook(headers("secret"), undefined), {
  ok: false, status: 503, error: "Webhook authentication is not configured",
});
assert.deepEqual(authorizeKoboWebhook(headers(null), "secret"), {
  ok: false, status: 401, error: "Unauthorized",
});
assert.deepEqual(authorizeKoboWebhook(headers("wrong"), "secret"), {
  ok: false, status: 401, error: "Unauthorized",
});
assert.deepEqual(authorizeKoboWebhook(headers("secret"), "secret"), { ok: true });
assert.equal(__testing.constantTimeEqual("same", "same"), true);
assert.equal(__testing.constantTimeEqual("same", "different"), false);

console.log("webhook auth fixture tests passed");

