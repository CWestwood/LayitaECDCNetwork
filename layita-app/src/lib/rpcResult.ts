import type { Json } from '../types/database.generated';

export type RpcObject = Record<string, Json | undefined>;

export function asJsonObject(value: Json | null | undefined): RpcObject | null {
  return value !== null && value !== undefined && !Array.isArray(value) && typeof value === 'object'
    ? value
    : null;
}

export function requireRpcObject(value: Json | null, operation: string): RpcObject {
  const result = asJsonObject(value);
  if (!result) {
    throw new Error(`${operation} returned an invalid response`);
  }

  const rpcError = result.error;
  if (typeof rpcError === 'string' && rpcError.trim()) {
    throw new Error(rpcError);
  }

  return result;
}

export function rpcString(result: RpcObject, key: string, fallback = ''): string {
  const value = result[key];
  return typeof value === 'string' ? value : fallback;
}

export function rpcNumber(result: RpcObject, key: string, fallback = 0): number {
  const value = result[key];
  return typeof value === 'number' ? value : fallback;
}

export function rpcBoolean(result: RpcObject, key: string): boolean | undefined {
  const value = result[key];
  return typeof value === 'boolean' ? value : undefined;
}
