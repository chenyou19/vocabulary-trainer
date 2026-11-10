import { normalizeText } from './model'
import type { SourceEntry, WordInput } from './model'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function validSourceEntry(value: unknown): value is SourceEntry {
  if (!isRecord(value) || !asText(value.english_word) || !asText(value.chinese_definition)) return false
  if (value.category !== undefined && typeof value.category !== 'string') return false
  if (value.toeic_score_range !== undefined && typeof value.toeic_score_range !== 'string') return false
  if (value.star_rating !== undefined && (typeof value.star_rating !== 'number' || !Number.isFinite(value.star_rating))) return false
  if (value.parts_of_speech !== undefined && !stringList(value.parts_of_speech)) return false
  if (value.exam_tips !== undefined && !stringList(value.exam_tips)) return false
  if (value.examples !== undefined && (!Array.isArray(value.examples) || !value.examples.every(example => isRecord(example) && typeof example.english === 'string' && typeof example.chinese === 'string'))) return false
  return value.word_forms === undefined || (Array.isArray(value.word_forms) && value.word_forms.every(form => isRecord(form) && typeof form.part_of_speech === 'string' && stringList(form.forms)))
}

export function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,，、|]/).map(tag => tag.trim()).filter(Boolean))]
}

export function validateWordInput(value: unknown): WordInput {
  if (!isRecord(value)) throw new Error('每一筆單字必須是物件。')
  const word = asText(value.word)
  const meaning = asText(value.meaning)
  if (!word || !meaning) throw new Error('英文單字與中文意思為必填欄位。')
  if (word.length > 180 || meaning.length > 2000) throw new Error('英文單字或中文意思超過字數上限。')
  if ([...word].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('英文單字含有控制字元。')

  const optional = ['partOfSpeech', 'example', 'exampleTranslation'] as const
  for (const field of optional) {
    if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`${field} 必須是文字。`)
    if (asText(value[field]).length > 4000) throw new Error(`${field} 超過字數上限。`)
  }
  if (value.tags !== undefined && !stringList(value.tags)) throw new Error('標籤必須是文字陣列。')
  const tags = stringList(value.tags) ? [...new Set(value.tags.map(tag => tag.trim()).filter(Boolean))] : []
  if (tags.some(tag => tag.length > 100)) throw new Error('標籤超過字數上限。')
  if (value.sourceEntries !== undefined && (!Array.isArray(value.sourceEntries) || !value.sourceEntries.every(validSourceEntry))) {
    throw new Error('來源資料格式錯誤。')
  }

  return {
    word,
    meaning,
    partOfSpeech: asText(value.partOfSpeech),
    example: asText(value.example),
    exampleTranslation: asText(value.exampleTranslation),
    tags,
    ...(value.sourceEntries ? { sourceEntries: value.sourceEntries as SourceEntry[] } : {}),
  }
}

function fromSource(entry: SourceEntry): WordInput {
  return validateWordInput({
    word: entry.english_word,
    meaning: entry.chinese_definition,
    partOfSpeech: entry.parts_of_speech?.join('、') ?? '',
    example: entry.examples?.[0]?.english ?? '',
    exampleTranslation: entry.examples?.[0]?.chinese ?? '',
    tags: entry.category ? [entry.category] : [],
    sourceEntries: [entry],
  })
}

function parseRow(value: unknown): WordInput {
  if (!isRecord(value) || !('english_word' in value)) return validateWordInput(value)
  if (!validSourceEntry(value)) throw new Error('原詞庫資料格式錯誤。')
  return fromSource(value)
}

export interface ImportPreview {
  words: WordInput[]
  duplicates: number
  invalid: number
  errors: string[]
}

export function parseRows(rows: unknown[]): ImportPreview {
  const words = new Map<string, WordInput>()
  const errors: string[] = []
  let duplicates = 0
  let invalid = 0
  rows.forEach((row, index) => {
    try {
      const word = parseRow(row)
      const key = normalizeText(word.word)
      const existing = words.get(key)
      if (!existing) {
        words.set(key, word)
      } else {
        duplicates++
        if (word.sourceEntries?.length) {
          existing.sourceEntries = [...(existing.sourceEntries ?? []), ...word.sourceEntries]
          existing.tags = [...new Set([...existing.tags, ...word.tags])]
        }
      }
    } catch (error) {
      invalid++
      if (errors.length < 5) errors.push(`第 ${index + 1} 筆：${error instanceof Error ? error.message : '格式錯誤。'}`)
    }
  })
  return { words: [...words.values()], duplicates, invalid, errors }
}

export function parseWordJson(source: string): ImportPreview {
  const parsed: unknown = JSON.parse(source.replace(/^\uFEFF/, ''))
  if (Array.isArray(parsed)) return parseRows(parsed)
  if (isRecord(parsed) && parsed.format === 'vocabulary-trainer-words' && parsed.version === 1 && Array.isArray(parsed.words)) {
    return parseRows(parsed.words)
  }
  throw new Error('請選擇單字匯出檔，或包含單字陣列的 JSON 檔。完整備份可在設定頁還原。')
}

function csvRecords(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false
  const text = source.replace(/^\uFEFF/, '')

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
        closedQuote = true
      } else {
        field += char
      }
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field)
      field = ''
      closedQuote = false
      if (char !== ',') {
        rows.push(row)
        row = []
        if (char === '\r' && text[index + 1] === '\n') index++
      }
    } else if (closedQuote) {
      throw new Error('CSV 引號後應為逗號或換行。')
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === '"') {
      throw new Error('CSV 欄位引號格式錯誤。')
    } else {
      field += char
    }
  }
  if (quoted) throw new Error('CSV 有未結束的引號。')
  rows.push([...row, field])
  return rows.filter(record => record.some(cell => cell.trim()))
}

export function parseWordCsv(source: string): ImportPreview {
  const [headers = [], ...rows] = csvRecords(source)
  const fields = headers.map(header => header.trim())
  if (!fields.includes('word') || !fields.includes('meaning') || new Set(fields).size !== fields.length) {
    throw new Error('CSV 欄名必須包含 word 和 meaning，且欄名不可重複。')
  }
  return parseRows(rows.map(row => {
    if (row.length !== fields.length) return null
    const entry = Object.fromEntries(fields.map((field, index) => [field, row[index]]))
    return { ...entry, tags: splitTags(entry.tags ?? '') }
  }))
}

export function wordListJson(words: readonly WordInput[]): string {
  return JSON.stringify({ format: 'vocabulary-trainer-words', version: 1, words: words.map(validateWordInput) }, null, 2)
}

export const csvExample = '\uFEFFword,meaning,partOfSpeech,example,exampleTranslation,tags\r\nschedule,行程表,名詞,The schedule is on my desk.,行程表在我的桌上。,辦公日常|會議\r\n'
