import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { localDate, shiftDate, validLocalDate } from '../src/domain/dates'
import { csvExample, parseWordCsv, parseWordJson, wordListJson } from '../src/domain/import'
import { normalizeText } from '../src/domain/model'
import type { Word } from '../src/domain/model'
import { buildQuiz, matchesSpelling } from '../src/domain/quiz'
import { rateWord, reviewInterval } from '../src/domain/srs'
import { summarize } from '../src/domain/stats'

function word(english: string, meaning: string): Word {
  const normalizedWord = normalizeText(english)
  return {
    id: normalizedWord, word: english, normalizedWord, meaning, partOfSpeech: '', tags: [], example: '', exampleTranslation: '',
    createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', stage: 0, nextReviewAt: '2026-11-10',
    correctCount: 0, wrongCount: 0,
  }
}

describe('間隔複習', () => {
  const now = new Date(2026, 10, 10, 12)
  const progress = { stage: 2, correctCount: 5, wrongCount: 1 }

  it.each([
    [1, 1, '2026-11-11'], [2, 3, '2026-11-13'], [3, 7, '2026-11-17'], [4, 14, '2026-11-24'],
    [5, 30, '2026-12-10'], [6, 60, '2027-01-09'], [7, 60, '2027-01-09'],
  ])('階段 %i 對應 %i 天', (stage, interval, due) => {
    expect(reviewInterval(stage)).toBe(interval)
    expect(rateWord({ ...progress, stage: stage - 1 }, 'good', now)).toMatchObject({ stage, nextReviewAt: due })
  })

  it('不會會重設階段，記錄錯誤並於隔天複習', () => {
    expect(rateWord(progress, 'again', now)).toEqual({ stage: 0, nextReviewAt: '2026-11-11', correctCount: 5, wrongCount: 2, isCorrect: false })
  })

  it('模糊保留階段與對錯次數，於隔天複習', () => {
    expect(rateWord(progress, 'hard', now)).toEqual({ stage: 2, nextReviewAt: '2026-11-11', correctCount: 5, wrongCount: 1, isCorrect: null })
  })

  it('記住了會提升階段、增加答對次數，而且保留原輸入', () => {
    expect(rateWord(progress, 'good', now)).toEqual({ stage: 3, nextReviewAt: '2026-11-17', correctCount: 6, wrongCount: 1, isCorrect: true })
    expect(progress).toEqual({ stage: 2, correctCount: 5, wrongCount: 1 })
  })
})

describe('本地日期', () => {
  const originalTimezone = process.env.TZ

  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  })

  it('在台灣時間跨年時使用本地日期', () => {
    process.env.TZ = 'Asia/Taipei'
    const now = new Date('2026-12-31T17:00:00.000Z')
    expect(localDate(now)).toBe('2027-01-01')
    expect(rateWord({ stage: 0, correctCount: 0, wrongCount: 0 }, 'good', now).nextReviewAt).toBe('2027-01-02')
  })

  it('跨夏令時間時依日曆日期加一天', () => {
    process.env.TZ = 'America/Los_Angeles'
    const now = new Date('2026-03-08T07:30:00.000Z')
    expect(localDate(now)).toBe('2026-03-07')
    expect(shiftDate(now, 1).toISOString()).toBe('2026-03-09T06:30:00.000Z')
    expect(rateWord({ stage: 1, correctCount: 1, wrongCount: 0 }, 'again', now).nextReviewAt).toBe('2026-03-08')
  })

  it('辨識閏日與不存在的日期', () => {
    expect(validLocalDate('2028-02-29')).toBe(true)
    expect(validLocalDate('2026-02-29')).toBe(false)
  })
})

describe('測驗', () => {
  const bank = [word('invoice', '發票'), word('bill', '發票'), word('budget', '預算'), word('order', '訂單'), word('meeting', '會議')]

  it.each(['en-zh', 'zh-en'] as const)('%s 的四個選項互異且僅包含一個正解', mode => {
    const questions = buildQuiz(bank, bank, mode, bank.length, () => 0.5)
    expect(questions).toHaveLength(mode === 'en-zh' ? bank.length : bank.length - 1)
    expect(new Set(questions.map(question => normalizeText(question.prompt))).size).toBe(questions.length)
    for (const question of questions) {
      const choices = question.options.map(normalizeText)
      expect(choices).toHaveLength(4)
      expect(new Set(choices).size).toBe(4)
      expect(choices.filter(option => option === normalizeText(question.answer))).toHaveLength(1)
      if (mode === 'zh-en' && question.prompt === '發票') {
        expect(choices.filter(option => ['invoice', 'bill'].includes(option))).toHaveLength(1)
      }
    }
  })

  it.each(['en-zh', 'zh-en'] as const)('%s 不將只差用法補充的同義詞列為干擾項', mode => {
    const annual = word('annual', '每年的；一年一次的（形容詞），常用於描述年度報告、會議或計畫等。')
    const yearly = word('yearly', '每年的；一年一次的')
    const pool = [annual, yearly, ...bank.slice(2)]
    const questions = buildQuiz([annual], pool, mode, 1, () => 0.999)
    expect(questions).toHaveLength(1)
    const [question] = questions
    expect(question.options).toHaveLength(4)
    expect(question.options.filter(option => option === question.answer)).toHaveLength(1)
    expect(question.options).not.toContain(mode === 'en-zh' ? yearly.meaning : yearly.word)
  })

  it('空題庫或有效選項不足時不產生選擇題，少量單字仍可練拼字', () => {
    expect(buildQuiz([], [], 'en-zh', 20)).toEqual([])
    expect(buildQuiz(bank.slice(0, 4), bank.slice(0, 4), 'en-zh', 20)).toEqual([])
    expect(buildQuiz(bank.slice(0, 3), bank.slice(0, 3), 'zh-en', 20)).toEqual([])
    expect(buildQuiz([bank[2]], [bank[2]], 'spelling', 20)).toMatchObject([{ answer: 'budget', options: [] }])
  })

  it('拼字略過有多個英文答案的中文提示', () => {
    expect(buildQuiz(bank, bank, 'spelling', 20).map(question => question.prompt)).not.toContain('發票')
  })

  it('拼字忽略前後空白與大小寫，並拒絕拼錯的字或多餘標點', () => {
    expect(matchesSpelling('  INVOICE \n', 'invoice')).toBe(true)
    expect(matchesSpelling('invioce', 'invoice')).toBe(false)
    expect(matchesSpelling('invoice.', 'invoice')).toBe(false)
    expect(matchesSpelling('supply  chain', 'supply chain')).toBe(false)
  })
})

describe('單字批次匯入', () => {
  it('CSV 範例可重新匯入，含逗號及換行的欄位維持原內容', () => {
    expect(parseWordCsv(csvExample).words[0]).toMatchObject({ word: 'schedule', tags: ['辦公日常', '會議'] })
    const preview = parseWordCsv('word,meaning,example\r\ninvoice,發票,"Please confirm,\nthanks."\r\n,缺少單字,\r\n')
    expect(preview.invalid).toBe(1)
    expect(preview.words[0].example).toBe('Please confirm,\nthanks.')
    expect(() => parseWordCsv('word,meaning\ninvoice,"未結束')).toThrow()
  })

  it('可從單字 JSON 匯出檔還原文字、例句及標籤', () => {
    const input = { word: 'quote', meaning: '報價', partOfSpeech: '名詞', example: 'Request a quote.', exampleTranslation: '索取報價。', tags: ['採購'] }
    expect(parseWordJson(wordListJson([input]))).toEqual({ words: [input], duplicates: 0, invalid: 0, errors: [] })
  })

  it('專案內的 TOEIC 詞庫保留每一筆原始條目，合併標準化後相同的詞頭', () => {
    const raw = readFileSync(new URL('../../toeic_vocabulary.json', import.meta.url), 'utf8')
    const entries: unknown[] = JSON.parse(raw.replace(/^\uFEFF/, ''))
    const preview = parseWordJson(raw)
    expect(preview.invalid).toBe(0)
    expect(preview.words.length + preview.duplicates).toBe(entries.length)
    expect(preview.words.flatMap(entry => entry.sourceEntries ?? [])).toHaveLength(entries.length)
  })
})

it('無單字及紀錄時維持空狀態，測驗正確率為未知', () => {
  const stats = summarize([], [], new Date(2026, 10, 10, 12))
  expect(stats).toMatchObject({ total: 0, due: 0, learned: 0, attempts: 0, todayLearned: 0, todayAccuracy: null, quizAccuracy: null, mistakes: [] })
  expect(stats.week).toHaveLength(7)
  expect(stats.week.every(day => day.learned === 0 && day.accuracy === null)).toBe(true)
})
