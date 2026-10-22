/** Text statistics and case conversion. Pure functions, so they are unit-tested without a browser. */

export interface TextStats {
  /** user-perceived characters (an emoji or é is one), spaces and line breaks included */
  chars: number
  charsNoSpace: number
  /** Chinese, Japanese and Korean characters: each one counts as a word */
  cjk: number
  /** runs of letters/digits outside CJK: "don't", "e-mail" and "3.14" are one word each */
  latinWords: number
  /** 字數 as Chinese and Japanese editors count it: CJK characters plus the other words */
  words: number
  lines: number
  paragraphs: number
  utf8Bytes: number
  /** at about 400 CJK characters or 230 other words a minute */
  readSeconds: number
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const CJK_ALL = new RegExp(CJK.source, 'gu')
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’.-][\p{L}\p{N}\p{M}]+)*/gu

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

export function textStats(text: string): TextStats {
  const g = graphemes(text)
  const cjk = g.filter((c) => CJK.test(c)).length
  const latinWords = (text.replace(CJK_ALL, ' ').match(WORD) ?? []).length
  return {
    chars: g.length,
    charsNoSpace: g.filter((c) => !/^\s+$/u.test(c)).length,
    cjk,
    latinWords,
    words: cjk + latinWords,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    paragraphs: text.split(/(?:\r?\n[^\S\r\n]*){2,}/).filter((p) => p.trim() !== '').length,
    utf8Bytes: new TextEncoder().encode(text).length,
    readSeconds: Math.round((cjk / 400 + latinWords / 230) * 60),
  }
}

export const CASE_MODES = [
  'upper',
  'lower',
  'title',
  'sentence',
  'camel',
  'pascal',
  'snake',
  'kebab',
  'constant',
  'halfwidth',
  'fullwidth',
] as const
export type CaseMode = (typeof CASE_MODES)[number]

// Full-width ASCII (U+FF01–U+FF5E) sits 0xFEE0 above ASCII; the full-width space is U+3000.
// Built from code points because the literal characters are invisible or look like their ASCII twins.
const WIDTH_SHIFT = 0xfee0
const IDEO_SPACE = String.fromCharCode(0x3000)
const FULL_ASCII = new RegExp(`[${String.fromCharCode(0xff01)}-${String.fromCharCode(0xff5e)}]`, 'g')

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** "XMLHttpRequest id_2" → ["XML", "Http", "Request", "id", "2"] */
export function splitWords(line: string): string[] {
  return line
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean)
}

/** Identifier styles work line by line, so a list of names converts in one go. */
const perLine = (text: string, join: (words: string[]) => string) =>
  text
    .split('\n')
    .map((line) => {
      const words = splitWords(line)
      return words.length ? join(words) : line.trim()
    })
    .join('\n')

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'title':
      return text
        .toLowerCase()
        .replace(/(^|[^\p{L}\p{N}\p{M}'’])(\p{L})/gu, (_, before, ch) => before + ch.toUpperCase())
    case 'sentence':
      return text
        .toLowerCase()
        .replace(/(^\s*|[.!?。！？]\s+|\n\s*)(\p{L})/gu, (_, before, ch) => before + ch.toUpperCase())
    case 'camel':
      return perLine(text, (w) => w.map((x, i) => (i === 0 ? x.toLowerCase() : cap(x.toLowerCase()))).join(''))
    case 'pascal':
      return perLine(text, (w) => w.map((x) => cap(x.toLowerCase())).join(''))
    case 'snake':
      return perLine(text, (w) => w.map((x) => x.toLowerCase()).join('_'))
    case 'kebab':
      return perLine(text, (w) => w.map((x) => x.toLowerCase()).join('-'))
    case 'constant':
      return perLine(text, (w) => w.map((x) => x.toUpperCase()).join('_'))
    case 'halfwidth':
      return text
        .replace(FULL_ASCII, (c) => String.fromCharCode(c.charCodeAt(0) - WIDTH_SHIFT))
        .replaceAll(IDEO_SPACE, ' ')
    case 'fullwidth':
      return text
        .replace(/[\x21-\x7E]/g, (c) => String.fromCharCode(c.charCodeAt(0) + WIDTH_SHIFT))
        .replaceAll(' ', IDEO_SPACE)
  }
}
