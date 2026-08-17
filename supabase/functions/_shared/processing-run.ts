import { PROCESSOR_VERSION } from "./process-payload.ts";
import { supabase } from "./supabase-client.ts";

type TriggerSource = "webhook" | "reprocess" | "ledger";

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function recordRawSubmission(instanceId: string, payload: unknown, payloadHash: string) {
  const { error } = await supabase.rpc("record_kobo_raw_submission", {
    p_instance_id: instanceId,
    p_payload: payload,
    p_payload_hash: payloadHash,
  });
  if (error) throw new Error(`Raw submission could not be recorded: ${error.message}`);
}

export async function beginProcessing(
  instanceId: string,
  triggerSource: TriggerSource,
  payloadHash: string | null,
  actorId: string | null = null,
  force = false,
) {
  const { data, error } = await supabase.rpc("begin_kobo_processing", {
    p_instance_id: instanceId,
    p_trigger_source: triggerSource,
    p_processor_version: PROCESSOR_VERSION,
    p_payload_hash: payloadHash,
    p_actor_id: actorId,
    p_force: force,
  });
  if (error) throw new Error(`Processing run could not be started: ${error.message}`);
  return data as string | null;
}

export async function finishProcessing(
  runId: string,
  result: {
    status: string;
    visitId?: string;
    error?: string;
    warnings?: string[];
    provenance?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.rpc("finish_kobo_processing", {
    p_run_id: runId,
    p_status: result.status,
    p_result_visit_id: result.visitId ?? null,
    p_error_message: result.error ?? null,
    p_warnings: result.warnings ?? null,
    p_provenance: result.provenance ?? {},
  });
  if (error) throw new Error(`Processing run could not be finished: ${error.message}`);
}

