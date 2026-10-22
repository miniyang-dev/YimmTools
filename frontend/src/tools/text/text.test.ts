import { describe, expect, it } from 'vitest'
import { convertCase, splitWords, textStats } from './text'

describe('textStats', () => {
  it('is all zeros for empty text', () => {
    const s = textStats('')
    expect([s.chars, s.words, s.lines, s.paragraphs, s.utf8Bytes, s.readSeconds]).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('counts CJK characters one by one and other words as runs', () => {
    const s = textStats('我用 iPhone 15 拍照。')
    expect(s.cjk).toBe(4) // 我 用 拍 照
    expect(s.latinWords).toBe(2) // iPhone, 15
    expect(s.words).toBe(6)
    expect(textStats('こんにちは、世界').cjk).toBe(7)
    expect(textStats('안녕하세요').cjk).toBe(5)
  })

  it('keeps contractions, hyphenations, decimals and domains whole', () => {
    expect(textStats("don't e-mail 3.14 example.com café").latinWords).toBe(5)
  })

  it('counts what a person sees as one character as one', () => {
    const s = textStats('👍🏽 é👨‍👩‍👧')
    expect(s.chars).toBe(4) // thumbs-up with skin tone, space, é (e + combining accent), family
    expect(s.charsNoSpace).toBe(3)
  })

  it('counts lines, paragraphs and UTF-8 bytes', () => {
    const s = textStats('第一段\n還是第一段\n\n  \n第二段\r\n')
    expect(s.lines).toBe(6)
    expect(s.paragraphs).toBe(2)
    expect(textStats('aé中😀').utf8Bytes).toBe(1 + 2 + 3 + 4)
  })

  it('estimates reading time', () => {
    expect(textStats('字'.repeat(400)).readSeconds).toBe(60)
    expect(textStats('word '.repeat(230)).readSeconds).toBe(60)
  })
})

describe('convertCase', () => {
  it('upper, lower, title and sentence case', () => {
    expect(convertCase('Hello wORLD', 'upper')).toBe('HELLO WORLD')
    expect(convertCase('Hello wORLD', 'lower')).toBe('hello world')
    expect(convertCase("the QUICK brown fox's café", 'title')).toBe("The Quick Brown Fox's Café")
    expect(convertCase('hELLO. how ARE you? fine!\nnew line', 'sentence')).toBe('Hello. How are you? Fine!\nNew line')
    expect(convertCase('ñandú está aquí', 'upper')).toBe('ÑANDÚ ESTÁ AQUÍ')
  })

  it('splits identifiers on separators and case changes', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request'])
    expect(splitWords('user_id2 -- Name')).toEqual(['user', 'id2', 'Name'])
  })

  it('writes every identifier style, line by line', () => {
    const src = 'user profile id\nXMLHttpRequest\n\nmax-retry_count'
    expect(convertCase(src, 'camel')).toBe('userProfileId\nxmlHttpRequest\n\nmaxRetryCount')
    expect(convertCase(src, 'pascal')).toBe('UserProfileId\nXmlHttpRequest\n\nMaxRetryCount')
    expect(convertCase(src, 'snake')).toBe('user_profile_id\nxml_http_request\n\nmax_retry_count')
    expect(convertCase(src, 'kebab')).toBe('user-profile-id\nxml-http-request\n\nmax-retry-count')
    expect(convertCase(src, 'constant')).toBe('USER_PROFILE_ID\nXML_HTTP_REQUEST\n\nMAX_RETRY_COUNT')
  })

  it('converts between full-width and half-width forms', () => {
    expect(convertCase('ＡＢＣ１２３！　（測試）', 'halfwidth')).toBe('ABC123! (測試)')
    expect(convertCase('ABC 123!', 'fullwidth')).toBe('ＡＢＣ　１２３！')
    expect(convertCase(convertCase('Hello, World! #42', 'fullwidth'), 'halfwidth')).toBe('Hello, World! #42')
  })
})
