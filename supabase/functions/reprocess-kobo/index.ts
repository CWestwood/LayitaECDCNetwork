import { processSubmission } from "../_shared/process-payload.ts";
import { beginProcessing, finishProcessing, sha256 } from "../_shared/processing-run.ts";
import { supabase } from "../_shared/supabase-client.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "administrator") return json({ error: "Forbidden" }, 403);

  const request = await req.json();
  const requestedIds = request.instance_ids ?? (request.instance_id ? [request.instance_id] : []);
  const ids = Array.from(new Set((requestedIds as unknown[]).map(String)));
  if (ids.length === 0) return json({ error: "No instance_id(s) provided" }, 400);
  if (ids.length > 50 || ids.some((id) => !UUID_RE.test(id))) {
    return json({ error: "Provide at most 50 valid instance UUIDs" }, 400);
  }

  const results = [];
  for (const id of ids) {
    const { data: raw, error } = await supabase
      .from("kobo_raw_submissions")
      .select("payload, payload_hash")
      .eq("instance_id", id)
      .maybeSingle();
    if (error || !raw?.payload) {
      results.push({ id, status: "failed", error: "Raw submission not found" });
      continue;
    }

    let runId: string | null = null;
    try {
      const payloadHash = raw.payload_hash ?? await sha256(JSON.stringify(raw.payload));
      runId = await beginProcessing(id, "reprocess", payloadHash, user.id, true);
      if (!runId) throw new Error("Processing run was not created");
      const result = await processSubmission(id, raw.payload);
      await finishProcessing(runId, result);
      results.push({ id, ...result });
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : String(processingError);
      if (runId) await finishProcessing(runId, { status: "failed", error: message }).catch(() => undefined);
      results.push({ id, status: "failed", error: message });
    }
  }
  return json({ results }, 200);
});

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
