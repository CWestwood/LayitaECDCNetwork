import { processSubmission } from "../_shared/process-payload.ts";
import {
  beginProcessing,
  finishProcessing,
  recordRawSubmission,
  sha256,
} from "../_shared/processing-run.ts";
import { authorizeKoboWebhook } from "../_shared/webhook-auth.ts";
import { extractKoboInstanceId, isKoboPayload } from "../_shared/kobo-payload.ts";
import { jsonResponse, operationalLog, requestCorrelationId } from "../_shared/operational-log.ts";

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

Deno.serve(async (req) => {
  const correlationId = requestCorrelationId(req);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, correlationId);

  const authorization = authorizeKoboWebhook(req.headers, Deno.env.get("KOBO_WEBHOOK_SECRET"));
  if (!authorization.ok) return jsonResponse({ error: authorization.error }, authorization.status, correlationId);

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAYLOAD_BYTES) return jsonResponse({ error: "Payload too large" }, 413, correlationId);

  let runId: string | null = null;
  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ error: "Payload too large" }, 413, correlationId);
    }
    const payload: unknown = JSON.parse(body);
    if (!isKoboPayload(payload)) return jsonResponse({ error: "Payload must be a JSON object" }, 400, correlationId);

    const instanceId = extractKoboInstanceId(payload);
    if (!instanceId) return jsonResponse({ error: "Missing instance ID" }, 400, correlationId);
    operationalLog("info", "kobo_processing_started", correlationId, { instance_id: instanceId });

    const payloadHash = await sha256(body);
    await recordRawSubmission(instanceId, payload, payloadHash);
    runId = await beginProcessing(instanceId, "webhook", payloadHash);
    if (!runId) {
      operationalLog("info", "kobo_processing_skipped", correlationId, { instance_id: instanceId });
      return jsonResponse({ message: "Submission already completed or is currently processing", correlation_id: correlationId }, 200, correlationId);
    }

    const result = await processSubmission(instanceId, payload);
    const resultWithCorrelation = {
      ...result,
      provenance: { ...(result.provenance ?? {}), correlation_id: correlationId },
    };
    await finishProcessing(runId, resultWithCorrelation);
    operationalLog(result.status === "failed" ? "error" : "info", "kobo_processing_finished", correlationId, { instance_id: instanceId, status: result.status });
    return jsonResponse({ ...resultWithCorrelation, correlation_id: correlationId }, result.status === "failed" ? 422 : 200, correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId) {
      await finishProcessing(runId, { status: "failed", error: message }).catch(() => undefined);
    }
    operationalLog("error", "kobo_processing_crashed", correlationId, { error: message });
    return jsonResponse({ error: message, correlation_id: correlationId }, 500, correlationId);
  }
});
