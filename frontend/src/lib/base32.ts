const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function cleanBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
}

export function isBase32(input: string): boolean {
  const s = cleanBase32(input)
  return s.length > 0 && /^[A-Z2-7]+$/.test(s)
}

export function base32Decode(input: string): Uint8Array {
  const s = cleanBase32(input)
  if (!s || !/^[A-Z2-7]+$/.test(s)) throw new Error('invalid-base32')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of s) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

export function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let bits = 0
  let value = 0
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}
