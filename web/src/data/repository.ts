import { validSettings, validateBackup } from '../domain/backup'
import type { Backup } from '../domain/backup'
import { localDate } from '../domain/dates'
import { validateWordInput } from '../domain/import'
import { defaultSettings, normalizeText } from '../domain/model'
import type { QuizQuestion, QuizSession, QuizType, Rating, Settings, Word, WordInput } from '../domain/model'
import { rateWord } from '../domain/srs'
import { database, vocabularyInitializationId } from './database'
import type { TrainerDatabase } from './database'

export function makeWord(input: WordInput, now: Date, id: string = crypto.randomUUID()): Word {
  const timestamp = now.toISOString()
  return {
    ...input, id, normalizedWord: normalizeText(input.word),
    createdAt: timestamp, updatedAt: timestamp, stage: 0, nextReviewAt: localDate(now), correctCount: 0, wrongCount: 0,
  }
}

export class Repository {
  private initialization: Promise<void> | undefined

  constructor(readonly db: TrainerDatabase) {}

  initializeProjectVocabulary(load: () => Promise<readonly WordInput[]>, now?: Date): Promise<void> {
    this.initialization ??= this.seedProjectVocabulary(load, now).finally(() => {
      this.initialization = undefined
    })
    return this.initialization
  }

  private async seedProjectVocabulary(load: () => Promise<readonly WordInput[]>, now?: Date): Promise<void> {
    const { words, reviewLogs, quizSessions, settings, metadata } = this.db
    const tables = [words, reviewLogs, quizSessions, settings, metadata]

    const hasInitialized = async () => {
      if (await metadata.get(vocabularyInitializationId)) return true
      const counts = await Promise.all([words.count(), reviewLogs.count(), quizSessions.count(), settings.count()])
      if (!counts.some(count => count > 0)) return false
      await metadata.put({ id: vocabularyInitializationId, reason: 'existing' })
      return true
    }

    if (await this.db.transaction('rw', tables, hasInitialized)) return
    const source = await load()
    if (!source.length) throw new Error('專案 TOEIC 詞庫沒有可用的單字。')
    const createdAt = now ?? new Date()
    const additions = source.map(input => makeWord(validateWordInput(input), createdAt))

    await this.db.transaction('rw', tables, async () => {
      // Another tab can initialize, clear, or restore while this tab downloads the corpus.
      if (await hasInitialized()) return
      await words.bulkAdd(additions)
      await metadata.put({ id: vocabularyInitializationId, reason: 'seeded' })
    })
  }

  listWords() {
    return this.db.words.toArray()
  }

  async wordsById(ids: string[]): Promise<Word[]> {
    return (await this.db.words.bulkGet(ids)).filter(word => word !== undefined)
  }

  async ensurePracticeWords(inputs: readonly WordInput[], now = new Date()): Promise<Word[]> {
    const additions = inputs.map(input => makeWord(validateWordInput(input), now))
    const { words } = this.db
    return this.db.transaction('rw', words, async () => {
      const existing = await words.where('normalizedWord').anyOf(additions.map(word => word.normalizedWord)).toArray()
      const byWord = new Map(existing.map(word => [word.normalizedWord, word]))
      for (const word of additions) {
        if (byWord.has(word.normalizedWord)) continue
        await words.add(word)
        byWord.set(word.normalizedWord, word)
      }
      return additions.map(word => byWord.get(word.normalizedWord)!)
    })
  }

  async addWord(value: unknown, now = new Date()): Promise<Word> {
    const word = makeWord(validateWordInput(value), now)
    await this.db.transaction('rw', this.db.words, async () => {
      if (await this.db.words.where('normalizedWord').equals(word.normalizedWord).count()) throw new Error('單字庫已有這個英文單字。')
      await this.db.words.add(word)
    })
    return word
  }

  async updateWord(id: string, value: unknown, now = new Date()): Promise<Word> {
    const input = validateWordInput(value)
    const normalizedWord = normalizeText(input.word)
    return this.db.transaction('rw', this.db.words, async () => {
      const previous = await this.db.words.get(id)
      if (!previous) throw new Error('找不到這個單字。')
      const duplicate = await this.db.words.where('normalizedWord').equals(normalizedWord).first()
      if (duplicate && duplicate.id !== id) throw new Error('單字庫已有這個英文單字。')
      const word = { ...previous, ...input, normalizedWord, updatedAt: now.toISOString() }
      await this.db.words.put(word)
      return word
    })
  }

  async removeWord(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.words, this.db.reviewLogs, async () => {
      await this.db.reviewLogs.where('wordId').equals(id).modify({ wordId: null })
      await this.db.words.delete(id)
    })
  }

  async importWords(values: readonly WordInput[], now = new Date()): Promise<{ added: number; existing: number }> {
    const inputs = values.map(validateWordInput)
    return this.db.transaction('rw', this.db.words, async () => {
      const stored = await this.db.words.toArray()
      const byKey = new Map(stored.map(word => [word.normalizedWord, word]))
      const additions = new Map<string, Word>()
      const updates = new Map<string, Word>()
      let existing = 0
      for (const input of inputs) {
        const key = normalizeText(input.word)
        const previous = byKey.get(key)
        if (!previous) {
          const word = makeWord(input, now)
          additions.set(word.id, word)
          byKey.set(key, word)
          continue
        }
        existing++
        if (!input.sourceEntries?.length) continue
        const sourceEntries = [...(previous.sourceEntries ?? [])]
        const storedCounts = new Map<string, number>()
        for (const entry of sourceEntries) {
          const identity = JSON.stringify(entry)
          storedCounts.set(identity, (storedCounts.get(identity) ?? 0) + 1)
        }
        for (const entry of input.sourceEntries) {
          const identity = JSON.stringify(entry)
          const remaining = storedCounts.get(identity) ?? 0
          if (remaining > 0) storedCounts.set(identity, remaining - 1)
          else sourceEntries.push(entry)
        }
        if (sourceEntries.length === (previous.sourceEntries?.length ?? 0)) continue
        const updated = {
          ...previous, sourceEntries, tags: [...new Set([...previous.tags, ...input.tags])], updatedAt: now.toISOString(),
        }
        byKey.set(key, updated)
        if (additions.has(updated.id)) additions.set(updated.id, updated)
        else updates.set(updated.id, updated)
      }
      await this.db.words.bulkAdd([...additions.values()])
      await this.db.words.bulkPut([...updates.values()])
      return { added: additions.size, existing }
    })
  }

  async rate(id: string, rating: Rating, logId: string, now = new Date(), card?: Pick<Word, 'word' | 'meaning'>): Promise<void> {
    await this.db.transaction('rw', this.db.words, this.db.reviewLogs, async () => {
      if (await this.db.reviewLogs.get(logId)) return
      const word = await this.db.words.get(id)
      if (!word) throw new Error('此單字已從單字庫移除。')
      const { isCorrect, ...progress } = rateWord(word, rating, now)
      const timestamp = now.toISOString()
      await this.db.words.update(id, { ...progress, updatedAt: timestamp })
      await this.db.reviewLogs.add({
        id: logId, wordId: word.id, word: card?.word ?? word.word, meaning: card?.meaning ?? word.meaning, timestamp, date: localDate(now),
        mode: 'flashcard', rating, isCorrect, sessionId: null, questionIndex: null,
      })
    })
  }

  async startQuiz(quizType: QuizType, totalQuestions: number, now = new Date()): Promise<QuizSession> {
    if (!Number.isSafeInteger(totalQuestions) || totalQuestions < 1) throw new Error('目前沒有可使用的題目。')
    const session: QuizSession = {
      id: crypto.randomUUID(), timestamp: now.toISOString(), quizType, totalQuestions,
      correctAnswers: 0, wrongAnswers: 0, status: 'in_progress',
    }
    await this.db.quizSessions.add(session)
    return session
  }

  async recordAnswer(sessionId: string, questionIndex: number, question: QuizQuestion, isCorrect: boolean, now = new Date()): Promise<boolean> {
    return this.db.transaction('rw', this.db.words, this.db.quizSessions, this.db.reviewLogs, async () => {
      const previous = await this.db.reviewLogs.where('[sessionId+questionIndex]').equals([sessionId, questionIndex]).first()
      if (previous) return previous.isCorrect === true
      const session = await this.db.quizSessions.get(sessionId)
      if (!session || session.status !== 'in_progress' || questionIndex !== session.correctAnswers + session.wrongAnswers) {
        throw new Error('測驗進度已變更。請重新開始。')
      }
      const word = await this.db.words.get(question.wordId)
      const timestamp = now.toISOString()
      if (word) {
        await this.db.words.update(word.id, {
          correctCount: word.correctCount + Number(isCorrect), wrongCount: word.wrongCount + Number(!isCorrect), updatedAt: timestamp,
        })
      }
      await this.db.reviewLogs.add({
        id: crypto.randomUUID(), wordId: word?.id ?? null, word: question.word, meaning: question.meaning,
        timestamp, date: localDate(now), mode: 'quiz', rating: null, isCorrect, sessionId, questionIndex,
      })
      await this.db.quizSessions.update(sessionId, {
        correctAnswers: session.correctAnswers + Number(isCorrect),
        wrongAnswers: session.wrongAnswers + Number(!isCorrect),
        status: questionIndex + 1 === session.totalQuestions ? 'completed' : 'in_progress',
      })
      return isCorrect
    })
  }

  async getSettings(): Promise<Settings> {
    const settings = await this.db.settings.get('settings')
    return settings ? { dailyGoal: settings.dailyGoal, theme: settings.theme } : defaultSettings
  }

  async saveSettings(update: Partial<Settings>): Promise<void> {
    await this.db.transaction('rw', this.db.settings, async () => {
      const settings = { ...await this.getSettings(), ...update }
      if (!validSettings(settings)) throw new Error('每日目標必須是 1 到 999 的整數。')
      await this.db.settings.put({ ...settings, id: 'settings' })
    })
  }

  async snapshot(now = new Date()): Promise<Backup> {
    return this.db.transaction('r', this.db.words, this.db.reviewLogs, this.db.quizSessions, this.db.settings, async () => ({
      format: 'vocabulary-trainer-backup', version: 1, exportedAt: now.toISOString(),
      words: await this.listWords(), reviewLogs: await this.db.reviewLogs.toArray(),
      quizSessions: await this.db.quizSessions.toArray(), settings: await this.getSettings(),
    }))
  }

  async restore(value: unknown): Promise<void> {
    const backup = validateBackup(value)
    await this.replace(backup, 'restored')
  }

  async clear(): Promise<void> {
    await this.replace({ words: [], reviewLogs: [], quizSessions: [], settings: defaultSettings }, 'cleared')
  }

  private async replace(
    data: Pick<Backup, 'words' | 'reviewLogs' | 'quizSessions' | 'settings'>,
    reason: 'cleared' | 'restored',
  ): Promise<void> {
    const { words, reviewLogs, quizSessions, settings, metadata } = this.db
    await this.db.transaction('rw', [words, reviewLogs, quizSessions, settings, metadata], async () => {
      await reviewLogs.clear()
      await quizSessions.clear()
      await words.clear()
      await words.bulkAdd(data.words)
      await quizSessions.bulkAdd(data.quizSessions)
      await reviewLogs.bulkAdd(data.reviewLogs)
      await settings.put({ ...data.settings, id: 'settings' })
      await metadata.put({ id: vocabularyInitializationId, reason })
    })
  }
}

export const repository = new Repository(database)
