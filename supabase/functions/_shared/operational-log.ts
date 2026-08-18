export function requestCorrelationId(request: Request) {
  const supplied = request.headers.get("x-layita-correlation-id") ?? request.headers.get("x-correlation-id");
  return supplied && /^[0-9a-fA-F-]{36}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function operationalLog(
  level: "info" | "warn" | "error",
  event: string,
  correlationId: string,
  details: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({ level, event, correlation_id: correlationId, ...details });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export function jsonResponse(body: unknown, status: number, correlationId: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId,
    },
  });
}
