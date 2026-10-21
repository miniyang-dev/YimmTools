export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export interface Jwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  alg?: string
}

export type JwtError = 'parts' | 'header' | 'payload'

export function decodeJwt(token: string): { ok: true; jwt: Jwt } | { ok: false; error: JwtError } {
  const parts = token
    .trim()
    .replace(/^Bearer\s+/i, '')
    .split('.')
  if (parts.length !== 3 && parts.length !== 2) return { ok: false, error: 'parts' }
  const parse = (part: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(part)))
  let header: unknown
  let payload: unknown
  try {
    header = parse(parts[0])
  } catch {
    return { ok: false, error: 'header' }
  }
  try {
    payload = parse(parts[1])
  } catch {
    return { ok: false, error: 'payload' }
  }
  if (typeof header !== 'object' || header === null || typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'payload' }
  }
  const h = header as Record<string, unknown>
  return {
    ok: true,
    jwt: {
      header: h,
      payload: payload as Record<string, unknown>,
      signature: parts[2] ?? '',
      alg: typeof h.alg === 'string' ? h.alg : undefined,
    },
  }
}

export const JWT_TIME_CLAIMS = ['exp', 'iat', 'nbf', 'auth_time'] as const
