// zh-CN is generated from zh-TW (OpenCC, Taiwan phrases -> Simplified).
// Edit zh-TW, then run `npm run i18n:cn`. Never edit the zh-CN blocks by hand.
//
// Two file shapes are understood:
//   strings.json / common.json : { "zh-TW": {...}, "en": {...}, ... }
//   tools/<id>/meta.json       : { id, group, order, server, "strings": { "zh-TW": {...}, ... } }
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as OpenCC from 'opencc-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const convert = OpenCC.Converter({ from: 'twp', to: 'cn' })
const LANG_ORDER = ['zh-TW', 'en', 'zh-CN', 'es', 'ja']

const files = [join(root, 'i18n', 'common.json')]
const toolsDir = join(root, 'tools')
for (const dir of readdirSync(toolsDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  for (const name of ['strings.json', 'meta.json']) {
    const f = join(toolsDir, dir.name, name)
    if (existsSync(f)) files.push(f)
  }
}

// Words OpenCC would rewrite but which must stay as written (product names, acronyms).
const KEEP = []
// Mainland terminology that OpenCC's phrase table does not cover.
const FIX = [
  ['查找', '查询'],
  ['通信协定', '协议'],
  ['协定', '协议'],
  ['连接端口', '端口'],
  ['网域', '域名'],
  ['预设', '默认'],
  ['清单', '列表'],
  ['拷贝', '复制'],
  ['帐号', '账号'],
  ['范例', '示例'],
  ['分页', '标签页'],
  ['中继数据', '元数据'],
  ['品质', '质量'],
  ['维持', '保持'],
  ['信心', '置信度'],
  ['权威 DNS', '权威 DNS'],
  ['字符串', '字符串'],
  ['字段', '字段'],
  ['截屏', '截图'],
  ['选档', '选文件'],
  ['十六进位', '十六进制'],
  ['粘贴', '粘贴'],
  ['产生', '生成'],
  ['前缀大写', '首字母大写'], // OpenCC reads 字首 as "prefix"
  ['单字', '单词'],
  ['内文', '正文'],
  ['套用', '应用'],
]

function toSimplified(value) {
  let out = convert(value)
  for (const w of KEEP) out = out.replaceAll(convert(w), w)
  for (const [a, b] of FIX) out = out.replaceAll(a, b)
  return out
}

/** Rebuild a { lang: dict } object with a freshly generated zh-CN, in a fixed language order. */
function withSimplified(byLang) {
  const cn = Object.fromEntries(Object.entries(byLang['zh-TW']).map(([k, v]) => [k, toSimplified(v)]))
  const ordered = {}
  for (const lang of LANG_ORDER) {
    if (lang === 'zh-CN') ordered[lang] = cn
    else if (byLang[lang]) ordered[lang] = byLang[lang]
  }
  return ordered
}

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  let result
  if (file.endsWith('meta.json')) result = { ...data, strings: withSimplified(data.strings) }
  else result = withSimplified(data)
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  console.log('zh-CN', file.replace(root, 'src'))
}
