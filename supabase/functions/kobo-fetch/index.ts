import { processSubmission } from "../_shared/process-payload.ts";
import {
  beginProcessing,
  finishProcessing,
  recordRawSubmission,
  sha256,
} from "../_shared/processing-run.ts";
import { authorizeKoboWebhook } from "../_shared/webhook-auth.ts";

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = authorizeKoboWebhook(req.headers, Deno.env.get("KOBO_WEBHOOK_SECRET"));
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) return json({ error: "Payload too large" }, 413);

  let runId: string | null = null;
  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_PAYLOAD_BYTES) {
      return json({ error: "Payload too large" }, 413);
    }
    const payload = JSON.parse(body);
    const instanceId = payload._uuid || payload._meta?.instanceID || null;
    if (!instanceId) return json({ error: "Missing instance ID" }, 400);

    const payloadHash = await sha256(body);
    await recordRawSubmission(instanceId, payload, payloadHash);
    runId = await beginProcessing(instanceId, "webhook", payloadHash);
    if (!runId) {
      return json({ message: "Submission already completed or is currently processing" }, 200);
    }

    const result = await processSubmission(instanceId, payload);
    await finishProcessing(runId, result);
    return json(result, result.status === "failed" ? 422 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      await finishProcessing(runId, { status: "failed", error: message }).catch(() => undefined);
    }
    return json({ error: message }, 500);
  }
});

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
