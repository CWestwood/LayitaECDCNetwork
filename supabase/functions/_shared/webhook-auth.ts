export type WebhookAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function authorizeKoboWebhook(
  headers: Pick<Headers, "get">,
  expectedSecret: string | undefined,
): WebhookAuthorization {
  if (!expectedSecret) {
    return { ok: false, status: 503, error: "Webhook authentication is not configured" };
  }
  const providedSecret = headers.get("x-kobo-webhook-secret") ?? "";
  if (!providedSecret || !constantTimeEqual(providedSecret, expectedSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export const __testing = { constantTimeEqual };

