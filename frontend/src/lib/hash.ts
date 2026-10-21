import { md5 } from 'js-md5'

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

const enc = new TextEncoder()

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export async function digest(algo: HashAlgo, data: Uint8Array): Promise<Uint8Array> {
  if (algo === 'MD5') return Uint8Array.from(md5.array(data))
  return new Uint8Array(await crypto.subtle.digest(algo, data as BufferSource))
}

export async function hmac(algo: HashAlgo, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (algo === 'MD5') return Uint8Array.from(md5.hmac.array(key, data))
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: algo }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
}

export const utf8 = (s: string) => enc.encode(s)
