import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseWordJson } from '../src/domain/import'
import { normalizeText } from '../src/domain/model'
import type { ReviewLog, Word, WordInput } from '../src/domain/model'
import { allPriority, groupPriority, orderPracticeWords, priorityProgress, prioritySearch, readPriority, selectPriority, wordPriority } from '../src/domain/priority'
import { buildQuiz } from '../src/domain/quiz'
import { learnedWordIds, summarize } from '../src/domain/stats'

const now = new Date(2026, 10, 10, 12)
const date = '2026-11-10'
const timestamp = now.toISOString()

function toWord(input: WordInput): Word {
  const normalizedWord = normalizeText(input.word)
  return {
    ...input, id: normalizedWord, normalizedWord, stage: 0, correctCount: 0, wrongCount: 0,
    createdAt: timestamp, updatedAt: timestamp, nextReviewAt: date,
  }
}

function word(name: string, ...stars: number[]): Word {
  return toWord({
    word: name, meaning: `意思 ${name}`, tags: [], partOfSpeech: '', example: '', exampleTranslation: '',
    sourceEntries: stars.map(star_rating => ({ english_word: name, chinese_definition: `意思 ${name}`, star_rating })),
  })
}

function hardReview(item: Word): ReviewLog {
  return {
    id: `review-${item.id}`, wordId: item.id, word: item.word, meaning: item.meaning,
    date, timestamp, mode: 'flashcard', rating: 'hard', isCorrect: null, sessionId: null, questionIndex: null,
  }
}

describe('來源優先分組', () => {
  it('同詞頭採最高的合法來源星級，手動與無效評級維持未分級', () => {
    expect(wordPriority(word('invoice', 1, 4, 3, 9, 4.5, -1))).toBe(4)
    expect(wordPriority(word('budget', 0, 9, 4.5, Number.NaN))).toBe(0)
    expect(wordPriority({})).toBe(0)
  })

  it('完整詞庫依星級分成最多 50 個字的批次，各層數量與尾組正確', async () => {
    const source = await readFile(new URL('../../toeic_vocabulary.json', import.meta.url), 'utf8')
    const tiers = groupPriority(parseWordJson(source).words.map(toWord))
    expect(tiers.map(tier => [tier.level, tier.words.length, tier.batches.length, tier.batches.at(-1)?.words.length])).toEqual([
      [5, 2685, 54, 35], [4, 3579, 72, 29], [3, 2719, 55, 19],
      [2, 1220, 25, 20], [1, 951, 20, 1], [0, 0, 0, undefined],
    ])
    expect(selectPriority(tiers, allPriority)).toHaveLength(11154)
    expect(selectPriority(tiers, { tier: 5, batch: 1 })[0].word).toBe('a copy of')
    expect(selectPriority(tiers, { tier: 1, batch: 20 }).map(item => item.word)).toEqual(['zoo'])
  })

  it('先按全庫詞頭分組，排序不受進度、輸入順序、分類及搜尋影響', () => {
    const source = Array.from({ length: 52 }, (_, index) => word(`word-${String(index).padStart(2, '0')}`, 5))
    source[51].tags = ['辦公']
    const selection = { tier: 5, batch: 2 } as const
    const before = selectPriority(groupPriority(source), selection)
    const updated = source.map(item => ({ ...item, stage: 5, correctCount: 9, nextReviewAt: '2026-12-10' })).reverse()
    const after = selectPriority(groupPriority(updated), selection)
    expect(after.map(item => item.id)).toEqual(before.map(item => item.id))
    expect(after.filter(item => item.tags.includes('辦公')).map(item => item.id)).toEqual(['word-51'])
    expect(after.filter(item => item.word.includes('50')).map(item => item.id)).toEqual(['word-50'])
    expect(selectPriority(groupPriority(source), { tier: 5, batch: 3 })).toEqual([])
  })

  it('星級與分組網址可往返，未分級與無效批號各自處理', () => {
    expect(readPriority(new URLSearchParams(prioritySearch({ tier: 5, batch: 2 })))).toEqual({ tier: 5, batch: 2 })
    expect(readPriority(new URLSearchParams('tier=0&batch=1'))).toEqual({ tier: 0, batch: 1 })
    expect(readPriority(new URLSearchParams('tier=9&batch=1'))).toEqual(allPriority)
    expect(readPriority(new URLSearchParams('tier=5&batch=0'))).toEqual({ tier: 5, batch: null })
    expect(readPriority(new URLSearchParams('tier=5&batch=99999999999999999'))).toEqual({ tier: 5, batch: null })
  })

  it('測驗題幹和選項都來自所選組，末組不足四個可做拼字', () => {
    const vocabulary = Array.from({ length: 51 }, (_, index) => word(`choice-${String(index).padStart(2, '0')}`, 5))
    const tiers = groupPriority([...vocabulary, word('other-tier', 1)])
    const batch = selectPriority(tiers, { tier: 5, batch: 1 })
    const ids = new Set(batch.map(item => item.id))
    const questions = buildQuiz(batch, batch, 'en-zh', 10)
    expect(questions).toHaveLength(10)
    for (const question of questions) {
      expect(ids.has(question.wordId)).toBe(true)
      expect(question.optionExplanations).toHaveLength(4)
      expect(question.optionExplanations?.every(option => ids.has(normalizeText(option.word)))).toBe(true)
    }
    const lastBatch = selectPriority(tiers, { tier: 5, batch: 2 })
    expect(buildQuiz(lastBatch, lastBatch, 'en-zh', 10)).toEqual([])
    expect(buildQuiz(lastBatch, lastBatch, 'spelling', 10)).toMatchObject([{ word: 'choice-50', options: [] }])
  })
})

describe('優先背誦與進度', () => {
  it('曾評「模糊」及完成測驗都算已練習，刪除單字的歷史不計組別進度', () => {
    const due = word('memo', 1)
    const upcoming = { ...word('shipment', 5), nextReviewAt: '2026-11-11', stage: 5 }
    const fresh = word('warehouse', 5)
    const logs: ReviewLog[] = [
      hardReview(due),
      { ...hardReview(upcoming), mode: 'quiz', isCorrect: false, rating: null, sessionId: 'quiz', questionIndex: 0 },
      { ...hardReview(fresh), wordId: null },
    ]
    const ids = learnedWordIds(logs)
    expect(ids).toEqual(new Set([due.id, upcoming.id]))
    expect(priorityProgress([due, upcoming, fresh], ids, date)).toEqual({ total: 3, learned: 2, due: 1, fresh: 1, proficient: 1 })
    expect(summarize([due, upcoming, fresh], logs, now)).toMatchObject({ learned: 2, due: 1, fresh: 1 })
    expect(summarize([fresh], [], now)).toMatchObject({ learned: 0, due: 0, fresh: 1 })
  })

  it('到期舊字按日期、來源星級、詞頭排，再背高星新字及未分級字', () => {
    const oldest = { ...word('older', 1), nextReviewAt: '2026-11-09' }
    const dueA = word('arrival', 2)
    const dueB = word('branch', 2)
    const dueHigh = word('delivery', 4)
    const freshHigh = word('export', 5)
    const freshLow = word('floor', 1)
    const manual = word('custom')
    const future = { ...word('future', 5), nextReviewAt: '2026-11-12' }
    const vocabulary = [freshHigh, dueB, future, manual, dueA, freshLow, oldest, dueHigh]
    const reviewed = new Set([oldest, dueA, dueB, dueHigh, future].map(item => item.id))
    const dueOrder = [oldest, dueHigh, dueA, dueB]
    expect(orderPracticeWords(vocabulary, reviewed, date, 'due')).toEqual(dueOrder)
    expect(orderPracticeWords(vocabulary, reviewed, date, 'today')).toEqual([...dueOrder, freshHigh, freshLow, manual])
    expect(orderPracticeWords(vocabulary, reviewed, date, 'all')).toEqual([...dueOrder, freshHigh, freshLow, manual, future])
    const selected = selectPriority(groupPriority(vocabulary), { tier: 5, batch: 1 })
    expect(orderPracticeWords(selected, reviewed, date, 'today')).toEqual([freshHigh])
  })
})
