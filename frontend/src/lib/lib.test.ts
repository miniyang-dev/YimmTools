import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode } from './base32'
import { convert, DEFAULT_OPTIONS } from './convert'
import { HASH_ALGOS, digest, hmac, toHex, utf8 } from './hash'
import { decodeJwt } from './jwt'
import { activeSets, entropyBits, generatePassword, randomInt, uuidV7 } from './password'
import { b64Decode, b64Encode, jsonErrorIndex, locate, parseJson } from './text'
import { hotp, parseOtpauth, totp } from './totp'

const ascii = (s: string) => new TextEncoder().encode(s)

describe('base32', () => {
  it('round-trips and ignores spacing/case/padding', () => {
    expect(base32Encode(ascii('foobar'))).toBe('MZXW6YTBOI')
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb-oi======'))).toBe('foobar')
  })
  it('rejects garbage', () => {
    expect(() => base32Decode('1890!')).toThrow()
  })
})

describe('TOTP / RFC 6238 vectors', () => {
  const k1 = ascii('12345678901234567890')
  const k256 = ascii('12345678901234567890123456789012')
  const k512 = ascii('1234567890123456789012345678901234567890123456789012345678901234')
  const step = (t: number) => BigInt(Math.floor(t / 30))
  it('SHA-1', async () => {
    expect(await hotp(k1, step(59), 8)).toBe('94287082')
    expect(await hotp(k1, step(1111111109), 8)).toBe('07081804')
    expect(await hotp(k1, step(1234567890), 8)).toBe('89005924')
    expect(await hotp(k1, step(20000000000), 8)).toBe('65353130')
  })
  it('SHA-256 and SHA-512', async () => {
    expect(await hotp(k256, step(59), 8, 'SHA-256')).toBe('46119246')
    expect(await hotp(k512, step(59), 8, 'SHA-512')).toBe('90693936')
  })
  it('totp() from a Base32 secret with 6 digits', async () => {
    const secret = base32Encode(k1)
    expect(await totp(secret, 59_000)).toBe('287082')
  })
  it('parses otpauth URIs', () => {
    const p = parseOtpauth(
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&algorithm=SHA256',
    )
    expect(p).toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Example',
      account: 'alice@example.com',
      digits: 8,
      algo: 'SHA-256',
      period: 30,
    })
    expect(parseOtpauth('https://example.com')).toBeNull()
    expect(parseOtpauth('otpauth://hotp/x?secret=AA')).toBeNull()
  })
})

describe('hash / hmac', () => {
  it('known digests of "abc"', async () => {
    expect(toHex(await digest('MD5', ascii('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(toHex(await digest('SHA-1', ascii('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(toHex(await digest('SHA-256', ascii('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
  it('HMAC of the classic fox sentence', async () => {
    const msg = ascii('The quick brown fox jumps over the lazy dog')
    expect(toHex(await hmac('SHA-256', ascii('key'), msg))).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
    expect(toHex(await hmac('MD5', ascii('key'), msg))).toBe('80070713463e7749b90c2dc24911e275')
    expect(toHex(await hmac('SHA-1', ascii('key'), msg))).toBe('de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9')
  })
  it('lists every algorithm', () => {
    expect(HASH_ALGOS).toHaveLength(5)
    expect(utf8('é').length).toBe(2)
  })
})

describe('jwt', () => {
  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
  it('decodes the canonical example', () => {
    const r = decodeJwt(token)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.jwt.alg).toBe('HS256')
      expect(r.jwt.payload).toMatchObject({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
    }
  })
  it('reports which part is broken', () => {
    expect(decodeJwt('abc')).toEqual({ ok: false, error: 'parts' })
    expect(decodeJwt('@@.eyJhIjoxfQ.x')).toEqual({ ok: false, error: 'header' })
    expect(decodeJwt('eyJhbGciOiJub25lIn0.@@.x')).toEqual({ ok: false, error: 'payload' })
  })
  it('strips a Bearer prefix', () => {
    expect(decodeJwt('Bearer ' + token).ok).toBe(true)
  })
})

describe('password / uuid', () => {
  const base = { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false }
  it('honours length and includes every selected class', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword(base)
      expect(p).toHaveLength(20)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).toMatch(/[^A-Za-z0-9]/)
    }
  })
  it('can avoid ambiguous characters', () => {
    const o = { ...base, avoidAmbiguous: true }
    for (let i = 0; i < 50; i++) expect(generatePassword(o)).not.toMatch(/[O0oIl1|`'"]/)
    expect(activeSets(o).join('')).not.toMatch(/[O0oIl1]/)
  })
  it('returns empty when nothing is selected, and entropy grows with length', () => {
    expect(generatePassword({ ...base, lower: false, upper: false, digits: false, symbols: false })).toBe('')
    expect(entropyBits({ ...base, length: 30 })).toBeGreaterThan(entropyBits({ ...base, length: 10 }))
  })
  it('randomInt stays in range and is unbiased on a 3-way split', () => {
    const counts = [0, 0, 0]
    for (let i = 0; i < 30000; i++) counts[randomInt(3)]++
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(600)
  })
  it('uuid v7 has version/variant bits and sorts by time', () => {
    const a = uuidV7(1_700_000_000_000)
    const b = uuidV7(1_700_000_001_000)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})

describe('json + base64 helpers', () => {
  it('locates parse errors', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": }')
    expect(r.ok).toBe(false)
    if (!r.ok) expect([r.line, r.column]).toEqual([3, 8])
    expect(locate('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
    expect(jsonErrorIndex('[1, 2,]')).toBe(6)
    expect(jsonErrorIndex('{"a": 01}')).toBe(7)
    expect(jsonErrorIndex('{"a": "x\\q"}')).toBe(9)
    expect(jsonErrorIndex('{"a": [1, {"b": null}], "c": -1.5e3}')).toBe(-1)
    expect(jsonErrorIndex('{} x')).toBe(3)
    expect(jsonErrorIndex('')).toBe(0)
  })
  it('round-trips UTF-8 base64 including URL-safe', () => {
    const s = '你好, 世界 ✓ ?>'
    expect(b64Decode(b64Encode(s))).toBe(s)
    const u = b64Encode(s, true)
    expect(u).not.toMatch(/[+/=]/)
    expect(b64Decode(u)).toBe(s)
  })
})

describe('format conversion', () => {
  it('csv -> json uses the header row and types numbers', () => {
    expect(JSON.parse(convert('a,b\n1,x\n2,y', 'csv', 'json'))).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ])
  })
  it('json -> csv unions keys and stringifies nested values', () => {
    const out = convert('[{"a":1,"n":{"k":1}},{"a":2,"b":"z"}]', 'json', 'csv')
    expect(out.split(/\r?\n/)[0]).toBe('a,n,b')
    expect(out).toContain('"{""k"":1}"')
  })
  it('yaml <-> json', () => {
    expect(JSON.parse(convert('a: 1\nb:\n  - x\n  - y\n', 'yaml', 'json'))).toEqual({ a: 1, b: ['x', 'y'] })
    expect(convert('{"a":[1,2]}', 'json', 'yaml', DEFAULT_OPTIONS)).toBe('a:\n  - 1\n  - 2\n')
  })
  it('throws on a scalar that cannot be a table', () => {
    expect(() => convert('[1,2,3]', 'json', 'csv')).toThrow('csv-shape')
  })
})
