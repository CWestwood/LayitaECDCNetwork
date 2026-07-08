import { markProcessed, processSubmission } from "../_shared/process-payload.ts";
import { supabase } from "../_shared/supabase-client.ts";
Deno.serve(async (req)=>{
  // This endpoint should only be callable by administrators
  const authHeader = req.headers.get("Authorization");
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace("Bearer ", "") ?? "");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
  if (profile?.role !== "administrator") {
    return json({
      error: "Forbidden"
    }, 403);
  }
  // Accept either a single ID or a batch
  const { instance_id, instance_ids } = await req.json();
  const ids = instance_ids ?? (instance_id ? [
    instance_id
  ] : []);
  if (ids.length === 0) {
    return json({
      error: "No instance_id(s) provided"
    }, 400);
  }
  const results = [];
  for (const id of ids){
    // Fetch the original raw payload
    const { data: raw } = await supabase.from("kobo_raw_submissions").select("payload").eq("instance_id", id).maybeSingle();
    if (!raw) {
      results.push({
        id,
        status: "failed",
        error: "Raw submission not found"
      });
      continue;
    }
    // Reset status so markProcessed can upsert cleanly
    await markProcessed(id, "failed", "Reprocessing started");
    const result = await processSubmission(id, raw.payload);
    await markProcessed(id, result.status, result.error, result.warnings);
    results.push({
      id,
      ...result
    });
  }
  return json({
    results
  }, 200);
});
const json = (body, status)=>new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
