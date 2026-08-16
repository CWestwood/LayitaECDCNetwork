export type KoboPayload = Record<string, unknown>;

export function isKoboPayload(value: unknown): value is KoboPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractKoboInstanceId(payload: KoboPayload): string | null {
  const candidate = payload._uuid ?? payload["meta/instanceID"] ??
    (isKoboPayload(payload._meta) ? payload._meta.instanceID : null);
  if (candidate === null || candidate === undefined) return null;

  const instanceId = String(candidate).trim();
  return instanceId || null;
}
