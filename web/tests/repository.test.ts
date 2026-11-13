import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TrainerDatabase } from '../src/data/database'
import { pdfPracticeInputs, pdfPracticeWords } from '../src/data/pdf-practice'
import { findPdfList } from '../src/data/pdf-vocabulary'
import { Repository } from '../src/data/repository'
import { parseBackup } from '../src/domain/backup'
import { parseWordJson } from '../src/domain/import'
import type { QuizQuestion, Word, WordInput } from '../src/domain/model'
import { summarize } from '../src/domain/stats'

const today = new Date(2026, 10, 10, 12)
const yesterday = new Date(2026, 10, 9, 12)

function input(word: string, meaning: string): WordInput {
  return { word, meaning, tags: [], partOfSpeech: '', example: '', exampleTranslation: '' }
}

function spellingQuestion(word: Word): QuizQuestion {
  return { wordId: word.id, word: word.word, meaning: word.meaning, prompt: word.meaning, answer: word.word, options: [] }
}

describe('IndexedDB', () => {
  let db: TrainerDatabase
  let repo: Repository

  beforeEach(() => {
    db = new TrainerDatabase(`trainer-test-${crypto.randomUUID()}`)
    repo = new Repository(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  async function seedLearning() {
    const invoice = await repo.addWord(input('invoice', '發票'), yesterday)
    const budget = await repo.addWord(input('budget', '預算'), yesterday)
    await repo.rate(invoice.id, 'good', 'yesterday-review', yesterday)
    await repo.rate(invoice.id, 'hard', 'today-review', today)
    const quiz = await repo.startQuiz('spelling', 2, today)
    await repo.recordAnswer(quiz.id, 0, spellingQuestion(invoice), true, today)
    await repo.recordAnswer(quiz.id, 1, spellingQuestion(budget), false, today)
    await repo.saveSettings({ dailyGoal: 12, theme: 'dark' })
    return { invoice, budget, quiz }
  }

  it('新增、編輯、重新開啟資料庫及刪除單字，刪除後保留歷史快照', async () => {
    expect(await repo.listWords()).toEqual([])
    const original = await repo.addWord(input('  Invoice  ', '發票'), yesterday)
    expect(original).toMatchObject({ word: 'Invoice', normalizedWord: 'invoice', stage: 0, nextReviewAt: '2026-11-09' })
    await repo.rate(original.id, 'good', 'review-once', yesterday)
    const updated = await repo.updateWord(original.id, { ...input('bill', '帳單'), tags: ['會計'] }, today)
    expect(updated).toMatchObject({ id: original.id, createdAt: original.createdAt, word: 'bill', meaning: '帳單', tags: ['會計'], stage: 1, correctCount: 1 })
    expect(updated.updatedAt).toBe(today.toISOString())
    db.close()
    db = new TrainerDatabase(db.name)
    repo = new Repository(db)
    expect(await repo.listWords()).toEqual([updated])
    await repo.removeWord(original.id)
    expect(await repo.listWords()).toEqual([])
    expect(await db.reviewLogs.toArray()).toMatchObject([{ wordId: null, word: 'Invoice', meaning: '發票' }])
  })

  it('新增或編輯時拒絕大小寫、空白與全形差異造成的重複詞頭', async () => {
    await repo.addWord(input('invoice', '發票'), today)
    const budget = await repo.addWord(input('budget', '預算'), today)
    await expect(repo.addWord(input('  ＩＮＶＯＩＣＥ  ', '帳單'), today)).rejects.toThrow(/已有/)
    await expect(repo.updateWord(budget.id, input('INVOICE', '發票'), today)).rejects.toThrow(/已有/)
    expect(await db.words.get(budget.id)).toEqual(budget)
    expect(await db.words.count()).toBe(2)
  })

  it('批次匯入已存在的詞頭可補齊來源，重複匯入時保留個人譯義及進度', async () => {
    const invoice = await repo.addWord(input('Invoice', '我的譯義'), yesterday)
    await repo.rate(invoice.id, 'good', 'personal-progress', yesterday)
    const source = parseWordJson(JSON.stringify([
      { english_word: 'invoice', chinese_definition: '發票', category: '會計', exam_tips: ['來源甲'] },
      { english_word: 'INVOICE', chinese_definition: '帳單', category: '採購', exam_tips: ['來源乙'] },
      { english_word: 'budget', chinese_definition: '預算', category: '財務' },
    ]))
    expect(await repo.importWords(source.words, today)).toEqual({ added: 1, existing: 1 })
    const afterImport = await repo.snapshot(today)
    expect(await db.words.get(invoice.id)).toMatchObject({
      word: 'Invoice', meaning: '我的譯義', stage: 1, correctCount: 1, tags: ['會計', '採購'],
      sourceEntries: [{ exam_tips: ['來源甲'] }, { exam_tips: ['來源乙'] }],
    })
    expect(await repo.importWords(source.words, today)).toEqual({ added: 0, existing: 2 })
    expect(await repo.snapshot(today)).toEqual(afterImport)
  })

  it('PDF 練習採用本組譯義，並重用既有單字的進度與識別碼', async () => {
    const lobby = await repo.addWord(input('Lobby', '我的譯義'), yesterday)
    await repo.rate(lobby.id, 'good', 'previous-rating', yesterday)
    const stored = await repo.listWords()
    const location = pdfPracticeWords(pdfPracticeInputs(findPdfList('7')!), stored, '2026-11-10')
    const verbs = pdfPracticeWords(pdfPracticeInputs(findPdfList('24')!), stored, '2026-11-10')
    expect(location.find(word => word.id === lobby.id)?.meaning).toBe('會客室,休息室')
    const card = verbs.find(word => word.id === lobby.id)!
    expect(card).toMatchObject({ word: 'lobby', meaning: '遊說.(名詞:大廳)', stage: 1 })
    expect(location.some(word => word.word === 'portray')).toBe(false)
    expect(findPdfList('20')).toBeUndefined()
    expect(pdfPracticeInputs(findPdfList('25')!).filter(word => word.word === 'innovate')).toHaveLength(1)

    const additions = [card, input('portray', '描寫')]
    const [first, second] = await Promise.all([
      repo.ensurePracticeWords(additions, today), repo.ensurePracticeWords(additions, today),
    ])
    expect(first).toEqual(second)
    expect(first[0]).toEqual(await db.words.get(lobby.id))
    expect(await db.words.count()).toBe(2)
    await repo.rate(lobby.id, 'good', 'pdf-rating', today, card)
    expect(await db.words.get(lobby.id)).toMatchObject({ meaning: '我的譯義', stage: 2 })
    expect(await db.reviewLogs.get('pdf-rating')).toMatchObject({ wordId: lobby.id, meaning: card.meaning })
  })

  it('重試複習及測驗寫入時，只計一次且保留首次作答', async () => {
    const word = await repo.addWord(input('invoice', '發票'), today)
    await Promise.all([repo.rate(word.id, 'good', 'one-review', today), repo.rate(word.id, 'good', 'one-review', today)])
    const quiz = await repo.startQuiz('spelling', 1, today)
    expect(await repo.recordAnswer(quiz.id, 0, spellingQuestion(word), false, today)).toBe(false)
    expect(await repo.recordAnswer(quiz.id, 0, spellingQuestion(word), true, today)).toBe(false)
    expect(await db.words.get(word.id)).toMatchObject({ stage: 1, correctCount: 1, wrongCount: 1 })
    expect(await db.reviewLogs.count()).toBe(2)
    expect(await db.quizSessions.get(quiz.id)).toMatchObject({ status: 'completed', correctAnswers: 0, wrongAnswers: 1 })
  })

  it('將完整學習資料匯出為版本化 JSON 並覆蓋還原', async () => {
    const { invoice } = await seedLearning()
    const before = await repo.snapshot(today)
    const backup = parseBackup(JSON.stringify(before))
    expect(backup).toMatchObject({ format: 'vocabulary-trainer-backup', version: 1, settings: { dailyGoal: 12, theme: 'dark' } })
    expect(backup.words).toHaveLength(2)
    expect(backup.reviewLogs).toHaveLength(4)
    expect(backup.quizSessions).toHaveLength(1)
    await repo.removeWord(invoice.id)
    await repo.addWord(input('schedule', '行程表'), today)
    await repo.saveSettings({ dailyGoal: 30, theme: 'light' })
    await repo.restore(backup)
    expect(await repo.snapshot(today)).toEqual(before)
  })

  it('版本不符、日期無效、重複詞頭或無效關聯的備份均不得覆蓋既有資料', async () => {
    await seedLearning()
    const before = await repo.snapshot(today)
    const badBackups = [
      { ...before, version: 999 },
      { ...before, words: [{ ...before.words[0], nextReviewAt: '2026-02-30' }] },
      { ...before, words: [...before.words, { ...before.words[0], id: 'different-id' }] },
      { ...before, reviewLogs: [{ ...before.reviewLogs[0], wordId: 'missing-word' }, ...before.reviewLogs.slice(1)] },
      { ...before, quizSessions: [] },
    ]
    for (const backup of badBackups) {
      await expect(repo.restore(backup)).rejects.toThrow()
      expect(await repo.snapshot(today)).toEqual(before)
    }
  })

  it('還原交易在寫入紀錄失敗時回滾四個資料表', async () => {
    await seedLearning()
    const before = await repo.snapshot(today)
    const replacement = {
      ...before,
      settings: { dailyGoal: 35, theme: 'light' },
      words: before.words.map(word => ({ ...word, meaning: `新譯義 ${word.meaning}` })),
    }
    const valid = parseBackup(JSON.stringify(replacement))
    let attemptedWrite = false
    const failWrite = () => {
      attemptedWrite = true
      throw new Error('模擬 IndexedDB 寫入失敗')
    }
    db.reviewLogs.hook('creating', failWrite)
    try {
      await expect(repo.restore(valid)).rejects.toThrow()
    } finally {
      db.reviewLogs.hook('creating').unsubscribe(failWrite)
    }
    expect(attemptedWrite).toBe(true)
    expect(await repo.snapshot(today)).toEqual(before)
  })

  it('以持久化的複習與作答更新各日學習量、正確率、階段和錯題', async () => {
    const { invoice, budget, quiz } = await seedLearning()
    const saved = await repo.snapshot(today)
    const stats = summarize(saved.words, saved.reviewLogs, today)
    expect(await db.words.get(invoice.id)).toMatchObject({ stage: 1, nextReviewAt: '2026-11-11', correctCount: 2, wrongCount: 0 })
    expect(await db.words.get(budget.id)).toMatchObject({ stage: 0, nextReviewAt: '2026-11-09', correctCount: 0, wrongCount: 1 })
    expect(saved.quizSessions).toMatchObject([{ id: quiz.id, totalQuestions: 2, correctAnswers: 1, wrongAnswers: 1, status: 'completed' }])
    expect(saved.reviewLogs).toContainEqual(expect.objectContaining({ rating: 'hard', isCorrect: null, date: '2026-11-10' }))
    expect(stats).toMatchObject({ total: 2, learned: 2, due: 1, attempts: 4, todayLearned: 2, todayAccuracy: 50, quizAccuracy: 50 })
    expect(stats.stages.map(stage => stage.count)).toEqual([1, 1, 0, 0])
    expect(stats.week[0]).toMatchObject({ date: '2026-11-04', learned: 0, accuracy: null, answers: 0 })
    expect(stats.week.at(-2)).toEqual({ date: '2026-11-09', learned: 1, accuracy: null, answers: 0 })
    expect(stats.week.at(-1)).toEqual({ date: '2026-11-10', learned: 2, accuracy: 50, answers: 2 })
    expect(stats.mistakes).toEqual([{ word: 'budget', meaning: '預算', count: 1 }])
  })
})
