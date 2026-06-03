import { processSubmission } from "../_shared/process-payload.ts";
import { supabase } from "../_shared/supabase-client.ts";
import { markProcessed } from "../_shared/process-payload.ts";
Deno.serve(async (req)=>{
  let instanceId = null;
  try {
    const payload = await req.json();
    instanceId = payload._uuid || payload._meta?.instanceID || null;
    if (!instanceId) {
      return json({
        error: "Missing instance ID"
      }, 400);
    }
    // Duplicate check — only skip if previously succeeded
    const { data: existing } = await supabase.from("kobo_processed").select("status").eq("instance_id", instanceId).maybeSingle();
    if (existing?.status === "success") {
      return json({
        message: "Already processed"
      }, 200);
    }
    await supabase.from("kobo_raw_submissions").upsert({
      instance_id: instanceId,
      payload
    }, {
      onConflict: "instance_id"
    });
    const result = await processSubmission(instanceId, payload);
    await markProcessed(instanceId, result.status, result.error, result.warnings);
    return json(result, result.status === "failed" ? 400 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (instanceId) await markProcessed(instanceId, "failed", message).catch(()=>{});
    return json({
      error: message
    }, 500);
  }
});
const json = (body, status)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
