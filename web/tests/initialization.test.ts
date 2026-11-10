import Dexie from 'dexie'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainerDatabase, vocabularyInitializationId } from '../src/data/database'
import { loadInitialVocabulary } from '../src/data/project-vocabulary'
import { Repository } from '../src/data/repository'
import type { Word, WordInput } from '../src/domain/model'

const now = new Date(2026, 10, 10, 12)
const words: WordInput[] = [
  { word: 'invoice', meaning: '發票', tags: [], partOfSpeech: '', example: '', exampleTranslation: '' },
  { word: 'budget', meaning: '預算', tags: [], partOfSpeech: '', example: '', exampleTranslation: '' },
]

function controlledLoad() {
  let started!: () => void
  let finish!: (values: WordInput[]) => void
  const loading = new Promise<void>(resolve => { started = resolve })
  const result = new Promise<WordInput[]>(resolve => { finish = resolve })
  const load = vi.fn(() => {
    started()
    return result
  })
  return { loading, finish, load }
}

describe('首次自動載入 TOEIC 詞庫', () => {
  let db: TrainerDatabase
  let repo: Repository

  beforeEach(() => {
    db = new TrainerDatabase(`trainer-initialization-${crypto.randomUUID()}`)
    repo = new Repository(db)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await db.delete()
  })

  it('在空白資料庫自動載入完整專案詞庫，重新開啟時不下載、不重建單字', async () => {
    const source = await readFile(new URL('../../toeic_vocabulary.json', import.meta.url), 'utf8')
    const fetchVocabulary = vi.fn().mockResolvedValue(new Response(source))
    vi.stubGlobal('fetch', fetchVocabulary)

    await repo.initializeProjectVocabulary(loadInitialVocabulary, now)
    expect(fetchVocabulary).toHaveBeenCalledOnce()
    expect(fetchVocabulary.mock.calls[0][0]).toMatch(/data\/toeic_vocabulary\.json$/)
    expect(await db.words.count()).toBe(11154)
    expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason: 'seeded' })
    const market = await db.words.where('normalizedWord').equals('market').first()
    expect(market).toMatchObject({ stage: 0, nextReviewAt: '2026-11-10', correctCount: 0, wrongCount: 0 })
    expect(market?.sourceEntries?.length).toBeGreaterThan(1)

    db.close()
    db = new TrainerDatabase(db.name)
    repo = new Repository(db)
    await repo.initializeProjectVocabulary(loadInitialVocabulary, now)
    expect(fetchVocabulary).toHaveBeenCalledOnce()
    expect(await db.words.where('normalizedWord').equals('market').first()).toEqual(market)
  }, 20_000)

  it('同一實例的並行啟動共用一次下載', async () => {
    const { loading, finish, load } = controlledLoad()
    const first = repo.initializeProjectVocabulary(load, now)
    const second = repo.initializeProjectVocabulary(load, now)
    expect(first).toBe(second)
    await loading
    finish(words)
    await Promise.all([first, second])
    expect(load).toHaveBeenCalledOnce()
    expect(await db.words.count()).toBe(2)
  })

  it('既有詞庫與學習紀錄保留原狀，升級 v1 後跳過下載', async () => {
    const legacy = new Dexie(db.name)
    legacy.version(1).stores({
      words: 'id, &normalizedWord, nextReviewAt, createdAt, *tags',
      reviewLogs: 'id, wordId, date, mode, &[sessionId+questionIndex]',
      quizSessions: 'id, timestamp, status',
      settings: 'id',
    })
    const timestamp = now.toISOString()
    const previous: Word = {
      ...words[0], meaning: '我的發票筆記', id: 'custom-word', normalizedWord: 'invoice',
      createdAt: timestamp, updatedAt: timestamp, stage: 3, nextReviewAt: '2026-11-17',
      correctCount: 3, wrongCount: 1,
    }
    try {
      await legacy.table('words').add(previous)
      await legacy.table('reviewLogs').add({
        id: 'previous-review', wordId: previous.id, word: previous.word, meaning: previous.meaning,
        timestamp, date: '2026-11-10', mode: 'flashcard', rating: 'good', isCorrect: true,
        sessionId: null, questionIndex: null,
      })
      await legacy.table('settings').add({ id: 'settings', dailyGoal: 15, theme: 'dark' })
    } finally {
      legacy.close()
    }

    const before = await repo.snapshot(now)
    const load = vi.fn(async () => words)
    await repo.initializeProjectVocabulary(load, now)
    expect(db.verno).toBe(2)
    expect(load).not.toHaveBeenCalled()
    expect(await repo.snapshot(now)).toEqual(before)
    expect(before.words).toEqual([previous])
    expect(before.reviewLogs).toHaveLength(1)
    expect(before.settings).toEqual({ dailyGoal: 15, theme: 'dark' })
    expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason: 'existing' })
  })

  it.each(['words', 'reviewLogs', 'quizSessions', 'settings'] as const)('只有 %s 資料仍屬既有資料庫', async table => {
    if (table === 'words') await repo.addWord(words[0], now)
    if (table === 'reviewLogs') {
      const word = await repo.addWord(words[0], now)
      await repo.rate(word.id, 'good', 'deleted-word-review', now)
      await repo.removeWord(word.id)
    }
    if (table === 'quizSessions') await repo.startQuiz('spelling', 1, now)
    if (table === 'settings') await repo.saveSettings({ dailyGoal: 20, theme: 'light' })

    const before = await repo.snapshot(now)
    const load = vi.fn(async () => words)
    await repo.initializeProjectVocabulary(load, now)
    expect(load).not.toHaveBeenCalled()
    expect(await repo.snapshot(now)).toEqual(before)
    expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason: 'existing' })
    if (table === 'words') {
      await repo.removeWord(before.words[0].id)
      await repo.initializeProjectVocabulary(load, now)
      expect(load).not.toHaveBeenCalled()
      expect(await db.words.count()).toBe(0)
    }
  })

  it.each(['cleared', 'restored'] as const)('操作 %s 後重新開啟仍保留空白詞庫', async reason => {
    const empty = await repo.snapshot(now)
    const load = vi.fn(async () => words)
    await repo.initializeProjectVocabulary(load, now)
    if (reason === 'cleared') await repo.clear()
    else await repo.restore(empty)

    db.close()
    db = new TrainerDatabase(db.name)
    repo = new Repository(db)
    await repo.initializeProjectVocabulary(load, now)
    expect(load).toHaveBeenCalledOnce()
    expect(await repo.snapshot(now)).toEqual(empty)
    expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason })
  })

  it('兩個資料庫連線同時載入時，只寫入先完成的一批', async () => {
    const other = new TrainerDatabase(db.name)
    const a = controlledLoad()
    const b = controlledLoad()
    try {
      const first = repo.initializeProjectVocabulary(a.load, now)
      const second = new Repository(other).initializeProjectVocabulary(b.load, now)
      await Promise.all([a.loading, b.loading])
      b.finish([{ ...words[0], meaning: '先完成的版本' }])
      await second
      const winner = await repo.listWords()
      a.finish(words)
      await first
      expect(winner).toMatchObject([{ meaning: '先完成的版本' }])
      expect(await repo.listWords()).toEqual(winner)
      expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason: 'seeded' })
    } finally {
      other.close()
    }
  })

  it.each(['cleared', 'restored', 'existing'] as const)('下載途中發生 %s 時優先保留另一連線的操作', async reason => {
    const other = new TrainerDatabase(db.name)
    const concurrent = new Repository(other)
    const { loading, finish, load } = controlledLoad()
    try {
      const empty = await concurrent.snapshot(now)
      const task = repo.initializeProjectVocabulary(load, now)
      await loading
      if (reason === 'cleared') await concurrent.clear()
      else if (reason === 'restored') await concurrent.restore(empty)
      else await concurrent.addWord({ ...words[0], meaning: '個人譯義' }, now)
      const before = await concurrent.snapshot(now)
      finish(words)
      await task
      expect(await repo.snapshot(now)).toEqual(before)
      expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason })
    } finally {
      other.close()
    }
  })

  it('HTTP、JSON 或不完整詞庫均不寫入，後續重試可完成', async () => {
    const fetchVocabulary = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('非 JSON 文字'))
      .mockResolvedValueOnce(new Response(JSON.stringify([...words, { word: 'incomplete' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify(words)))
    vi.stubGlobal('fetch', fetchVocabulary)
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(repo.initializeProjectVocabulary(loadInitialVocabulary, now)).rejects.toThrow()
      expect(await db.words.count()).toBe(0)
      expect(await db.metadata.get(vocabularyInitializationId)).toBeUndefined()
    }
    await repo.initializeProjectVocabulary(loadInitialVocabulary, now)
    expect(fetchVocabulary).toHaveBeenCalledTimes(4)
    expect(await db.words.count()).toBe(2)
  })

  it('初始化標記寫入失敗時整批回滾，重試後成功', async () => {
    const rejectMarker = () => { throw new Error('模擬標記寫入失敗') }
    const load = vi.fn(async () => words)
    db.metadata.hook('creating', rejectMarker)
    try {
      await expect(repo.initializeProjectVocabulary(load, now)).rejects.toThrow()
    } finally {
      db.metadata.hook('creating').unsubscribe(rejectMarker)
    }
    expect(await db.words.count()).toBe(0)
    expect(await db.metadata.get(vocabularyInitializationId)).toBeUndefined()

    await repo.initializeProjectVocabulary(load, now)
    expect(load).toHaveBeenCalledTimes(2)
    expect(await db.words.count()).toBe(2)
    expect(await db.metadata.get(vocabularyInitializationId)).toMatchObject({ reason: 'seeded' })
  })
})
