import { createClient } from "npm:@supabase/supabase-js@2";
import { operationalLog, requestCorrelationId } from "../_shared/operational-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdminAction =
  | { action: "list" }
  | { action: "invite"; email: string; name: string; role: string; layita_staff_id?: string | null }
  | { action: "update"; user_id: string; name: string; role: string; layita_staff_id?: string | null }
  | { action: "deactivate" | "reactivate" | "reset"; user_id: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  const correlationId = requestCorrelationId(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !authorization) {
    return json({ error: "Unauthorized" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: caller, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller.user) return json({ error: "Unauthorized" }, 401);
  const { data: callerProfile } = await serviceClient
    .from("profiles")
    .select("role, is_active")
    .eq("id", caller.user.id)
    .maybeSingle();
  if (callerProfile?.role !== "administrator" || callerProfile.is_active === false) {
    return json({ error: "Administrator access required" }, 403);
  }

  let body: AdminAction;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validRoles = new Set(["administrator", "manager", "datacapturer", "library"]);
  operationalLog("info", "admin_users_request", correlationId, { action: body.action, actor_id: caller.user.id });

  if (body.action === "list") {
    const [{ data: authData, error: authError }, { data: profiles, error: profileError }, { data: staff, error: staffError }] = await Promise.all([
      serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      serviceClient.from("profiles").select("id, email, name, role, layita_staff_id, is_active, deactivated_at").order("name"),
      serviceClient.from("layita_staff").select("id, name, role, is_active, deactivated_at").order("name"),
    ]);
    if (authError || profileError || staffError) {
      return json({ error: authError?.message ?? profileError?.message ?? staffError?.message }, 500);
    }
    const authById = new Map((authData.users ?? []).map((user) => [user.id, user]));
    return json({
      users: (profiles ?? []).map((profile) => {
        const authUser = authById.get(profile.id);
        return {
          ...profile,
          email: authUser?.email ?? profile.email,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          invited_at: authUser?.invited_at ?? null,
        };
      }),
      staff: staff ?? [],
    });
  }

  if (body.action === "invite") {
    if (!body.email?.trim() || !body.name?.trim() || !validRoles.has(body.role)) {
      return json({ error: "Valid email, name, and role are required" }, 400);
    }
    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(body.email.trim(), {
      data: { name: body.name.trim(), role: body.role },
    });
    if (error || !data.user) return json({ error: error?.message ?? "Invite failed" }, 400);
    const { error: profileError } = await serviceClient.from("profiles").upsert({
      id: data.user.id,
      email: body.email.trim(),
      name: body.name.trim(),
      role: body.role,
      layita_staff_id: body.layita_staff_id ?? null,
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
    });
    if (profileError) {
      await serviceClient.auth.admin.deleteUser(data.user.id);
      return json({ error: profileError.message }, 500);
    }
    return json({ success: true, user_id: data.user.id });
  }

  if (body.action === "update") {
    if (!body.user_id || !body.name?.trim() || !validRoles.has(body.role)) {
      return json({ error: "Valid user, name, and role are required" }, 400);
    }
    if (body.user_id === caller.user.id && body.role !== "administrator") {
      const { count } = await serviceClient.from("profiles").select("id", { count: "exact", head: true })
        .eq("role", "administrator").eq("is_active", true);
      if ((count ?? 0) <= 1) return json({ error: "The last active administrator cannot change their own role" }, 409);
    }
    const { error } = await serviceClient.from("profiles").update({
      name: body.name.trim(), role: body.role, layita_staff_id: body.layita_staff_id ?? null,
    }).eq("id", body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles").select("email, layita_staff_id").eq("id", body.user_id).maybeSingle();
  if (targetError || !targetProfile) return json({ error: targetError?.message ?? "User not found" }, 404);

  if (body.action === "reset") {
    if (!targetProfile.email) return json({ error: "User has no email address" }, 400);
    const { error } = await serviceClient.auth.resetPasswordForEmail(targetProfile.email);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true });
  }

  const active = body.action === "reactivate";
  if (!active && body.user_id === caller.user.id) {
    return json({ error: "You cannot deactivate your own account" }, 409);
  }
  const { error: authError } = await serviceClient.auth.admin.updateUserById(body.user_id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (authError) return json({ error: authError.message }, 400);
  const timestamp = active ? null : new Date().toISOString();
  const { error: profileError } = await serviceClient.from("profiles").update({
    is_active: active,
    deactivated_at: timestamp,
    deactivated_by: active ? null : caller.user.id,
  }).eq("id", body.user_id);
  if (profileError) return json({ error: profileError.message }, 500);
  if (targetProfile.layita_staff_id) {
    await serviceClient.from("layita_staff").update({ is_active: active, deactivated_at: timestamp })
      .eq("id", targetProfile.layita_staff_id);
  }
  return json({ success: true, active });
});
