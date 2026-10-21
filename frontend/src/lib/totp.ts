import { base32Decode } from './base32'

export type TotpAlgo = 'SHA-1' | 'SHA-256' | 'SHA-512'

export interface TotpOptions {
  period?: number
  digits?: number
  algo?: TotpAlgo
}

export async function hotp(key: Uint8Array, counter: bigint, digits = 6, algo: TotpAlgo = 'SHA-1'): Promise<string> {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setBigUint64(0, counter, false)
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: algo }, false, [
    'sign',
  ])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, buf))
  const o = h[h.length - 1] & 0x0f
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export async function totp(secret: string, timeMs: number, opts: TotpOptions = {}): Promise<string> {
  const { period = 30, digits = 6, algo = 'SHA-1' } = opts
  const counter = BigInt(Math.floor(timeMs / 1000 / period))
  return hotp(base32Decode(secret), counter, digits, algo)
}

export interface OtpAuth {
  secret: string
  issuer?: string
  account?: string
  algo: TotpAlgo
  digits: number
  period: number
}

export function parseOtpauth(uri: string): OtpAuth | null {
  let url: URL
  try {
    url = new URL(uri.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') return null
  const secret = url.searchParams.get('secret')
  if (!secret) return null
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const [labelIssuer, account] = label.includes(':') ? label.split(/:(.*)/s) : [undefined, label]
  const algoRaw = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '')
  const algo: TotpAlgo = algoRaw === 'SHA256' ? 'SHA-256' : algoRaw === 'SHA512' ? 'SHA-512' : 'SHA-1'
  const digits = Number(url.searchParams.get('digits') ?? 6)
  const period = Number(url.searchParams.get('period') ?? 30)
  return {
    secret,
    issuer: url.searchParams.get('issuer') ?? labelIssuer,
    account: account || undefined,
    algo,
    digits: digits === 8 ? 8 : digits === 7 ? 7 : 6,
    period: period > 0 ? period : 30,
  }
}
