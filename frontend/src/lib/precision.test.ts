import { describe, expect, it } from 'vitest'
import { ConvertError, convert } from './convert'
import { formatJson, parseJsonPrecise, stringifyValue } from './json-lossless'
import { jsonErrorIndex, locate, missingCommaAt } from './text'
import { parseTimeInput, wallTimeToEpoch } from './time'

const two = { indent: '  ', sortKeys: false }

describe('lossless JSON formatting', () => {
  it('keeps big integers, exponents and number spelling exactly', () => {
    const src = '{"id":12345678901234567890,"huge":1e400,"x":1.0,"y":-0.50,"z":1E5}'
    const out = formatJson(src, two)
    expect(out).toContain('12345678901234567890')
    expect(out).toContain('1e400')
    expect(out).toContain('"x": 1.0')
    expect(out).toContain('"y": -0.50')
    expect(out).toContain('1E5')
  })
  it('keeps key order (integer-like keys are not reordered) and string escapes', () => {
    const out = formatJson('{"2":"a\\u00e9\\n","1":"b","a":"\\/"}', two)
    expect(out.indexOf('"2"')).toBeLessThan(out.indexOf('"1"'))
    expect(out).toContain('"a\\u00e9\\n"')
    expect(out).toContain('"\\/"')
  })
  it('matches JSON.stringify on ordinary documents', () => {
    const doc = { a: [1, 2, { b: null, c: [] }], d: {}, e: 'x y', f: true, g: [[], {}] }
    for (const n of [2, 4]) {
      expect(formatJson(JSON.stringify(doc), { indent: ' '.repeat(n), sortKeys: false })).toBe(
        JSON.stringify(doc, null, n),
      )
    }
    expect(formatJson(JSON.stringify(doc, null, 3), { indent: '', sortKeys: false })).toBe(JSON.stringify(doc))
  })
  it('sorts keys recursively when asked', () => {
    expect(formatJson('{"b":1,"a":{"d":1,"c":2}}', { indent: '', sortKeys: true })).toBe('{"a":{"c":2,"d":1},"b":1}')
  })
  it('parseJsonPrecise yields BigInt only for unsafe integers; stringifyValue round-trips them', () => {
    const v = parseJsonPrecise('{"a":9007199254740993,"b":42,"c":1.5,"d":[12345678901234567890]}') as Record<
      string,
      unknown
    >
    expect(v.a).toBe(9007199254740993n)
    expect(v.b).toBe(42)
    expect(stringifyValue(v, 0)).toBe('{"a":9007199254740993,"b":42,"c":1.5,"d":[12345678901234567890]}')
  })
})

describe('conversion keeps cell text intact', () => {
  it('CSV: leading zeros, trailing zeros and long ids stay strings', () => {
    const rows = JSON.parse(
      convert('zip,phone,price,id,ok,n\n00123,0912345678,1.50,12345678901234567890,true,7\n', 'csv', 'json'),
    )
    expect(rows).toEqual([
      { zip: '00123', phone: '0912345678', price: '1.50', id: '12345678901234567890', ok: true, n: 7 },
    ])
  })
  it('JSON -> YAML/CSV keeps big integers', () => {
    expect(convert('{"id":12345678901234567890}', 'json', 'yaml')).toContain('12345678901234567890')
    expect(convert('[{"id":12345678901234567890}]', 'json', 'csv')).toContain('12345678901234567890')
  })
  it('YAML -> JSON keeps big integers', () => {
    expect(convert('id: 12345678901234567890\nn: 5\n', 'yaml', 'json')).toContain('"id": 12345678901234567890')
  })
})

describe('time input respects the chosen zone', () => {
  it('reads bare date-times in the selected zone', () => {
    expect(new Date(parseTimeInput('2025-01-31 08:00', 'Asia/Tokyo')!.ms).toISOString()).toBe(
      '2025-01-30T23:00:00.000Z',
    )
    expect(new Date(parseTimeInput('2025-01-31T08:00:30.5', 'UTC')!.ms).toISOString()).toBe('2025-01-31T08:00:30.500Z')
    expect(new Date(parseTimeInput('2025-01-31 08:00', 'America/New_York')!.ms).toISOString()).toBe(
      '2025-01-31T13:00:00.000Z',
    )
  })
  it('is DST-aware and treats date-only as midnight in that zone', () => {
    expect(new Date(parseTimeInput('2025-07-01 12:00', 'America/New_York')!.ms).toISOString()).toBe(
      '2025-07-01T16:00:00.000Z',
    )
    expect(new Date(parseTimeInput('2025-01-31', 'Asia/Taipei')!.ms).toISOString()).toBe('2025-01-30T16:00:00.000Z')
    // 02:30 does not exist on 2025-03-09 in New York; it resolves forward past the gap
    expect(new Date(wallTimeToEpoch(Date.UTC(2025, 2, 9, 2, 30), 'America/New_York')).toISOString()).toBe(
      '2025-03-09T07:30:00.000Z',
    )
  })
  it('honours explicit offsets, numbers, and rejects impossible dates', () => {
    expect(new Date(parseTimeInput('2025-01-31T08:00:00+08:00', 'America/New_York')!.ms).toISOString()).toBe(
      '2025-01-31T00:00:00.000Z',
    )
    expect(parseTimeInput('1735689600', 'UTC')).toEqual({ ms: 1735689600000, unit: 'sec' })
    expect(parseTimeInput('1735689600123', 'UTC')).toEqual({ ms: 1735689600123, unit: 'ms' })
    expect(Number.isNaN(parseTimeInput('2025-02-30', 'UTC')!.ms)).toBe(true)
    expect(Number.isNaN(parseTimeInput('2025-13-01', 'UTC')!.ms)).toBe(true)
    expect(Number.isNaN(parseTimeInput('garbage', 'UTC')!.ms)).toBe(true)
    expect(parseTimeInput('  ', 'UTC')).toBeNull()
  })
})

describe('missing-comma hint', () => {
  const at = (text: string) => {
    const i = jsonErrorIndex(text)
    const end = missingCommaAt(text, i)
    return end === null ? null : locate(text, end)
  }

  it('points at the end of the line that lacks the comma, not the next line', () => {
    const text = '{\n  "name": "王小明",\n  "age": 25,\n  "isStudent": false\n  "skills": ["a"]\n}'
    expect(locate(text, jsonErrorIndex(text)).line).toBe(5) // where the parser stops
    expect(at(text)).toEqual({ line: 4, column: 21 }) // right after `false`
  })

  it('works after strings, numbers, null, closing brackets, and inside arrays', () => {
    expect(at('{"a": "x"\n"b": 1}')?.line).toBe(1)
    expect(at('{"a": 1\n"b": 1}')?.line).toBe(1)
    expect(at('{"a": null "b": 1}')).toEqual({ line: 1, column: 11 })
    expect(at('{"a": {}\n"b": 1}')?.line).toBe(1)
    expect(at('[1 2]')).toEqual({ line: 1, column: 3 })
    expect(at('[true\nfalse]')?.line).toBe(1)
  })

  it('stays quiet when the problem is something else', () => {
    expect(at('{"a": }')).toBeNull() // missing value
    expect(at('[1, 2,]')).toBeNull() // trailing comma
    expect(at('{"a" 1}')).toBeNull() // a missing colon after a key is not a missing comma
    expect(at('{"a": 1, "b" "c"}')).toBeNull()
  })
})

describe('conversion errors carry a position', () => {
  const fail = (input: string, from: 'json' | 'yaml' | 'csv') => {
    try {
      convert(input, from, 'json')
    } catch (e) {
      return e as ConvertError
    }
    throw new Error('expected a failure')
  }

  it('YAML: the line and column the parser reports', () => {
    const e = fail('name: ok\nlist:\n  - a\n  - [b\nnext: 1\n', 'yaml')
    expect(e).toBeInstanceOf(ConvertError)
    expect(e.kind).toBe('yaml')
    expect(e.line).toBeGreaterThanOrEqual(4)
    expect(e.offset).toBeDefined()
  })

  it('JSON: a missing comma points at the line that lacks it', () => {
    const e = fail('{\n  "a": 1,\n  "b": false\n  "c": 2\n}', 'json')
    expect(e.kind).toBe('json')
    expect(e.line).toBe(3)
  })

  it('CSV: an unterminated quote points into the text', () => {
    const e = fail('a,b\n1,2\n3,"oops\n', 'csv')
    expect(e.kind).toBe('csv')
    expect(e.line).toBe(3)
  })

  it('non-tabular data for CSV output has no position', () => {
    let err: ConvertError | undefined
    try {
      convert('[1,2]', 'json', 'csv')
    } catch (e) {
      err = e as ConvertError
    }
    expect(err?.kind).toBe('csv-shape')
    expect(err?.line).toBeUndefined()
  })
})
