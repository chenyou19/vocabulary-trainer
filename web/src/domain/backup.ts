import { validLocalDate, validTimestamp } from './dates'
import { isRecord, validateWordInput } from './import'
import { normalizeText, ratings } from './model'
import type { QuizSession, ReviewLog, Settings, Word } from './model'

export interface Backup {
  format: 'vocabulary-trainer-backup'
  version: 1
  exportedAt: string
  words: Word[]
  reviewLogs: ReviewLog[]
  quizSessions: QuizSession[]
  settings: Settings
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function validSettings(value: unknown): value is Settings {
  return isRecord(value) && isCount(value.dailyGoal) && value.dailyGoal >= 1 && value.dailyGoal <= 999
    && (value.theme === 'light' || value.theme === 'dark')
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 180
}

function validWord(value: unknown): value is Word {
  if (!isRecord(value) || !isId(value.id)) return false
  try {
    const word = validateWordInput(value)
    return value.word === word.word && value.meaning === word.meaning
      && value.partOfSpeech === word.partOfSpeech && value.example === word.example
      && value.exampleTranslation === word.exampleTranslation
      && JSON.stringify(value.tags) === JSON.stringify(word.tags)
      && value.normalizedWord === normalizeText(word.word)
      && validTimestamp(value.createdAt) && validTimestamp(value.updatedAt) && value.updatedAt >= value.createdAt
      && validLocalDate(value.nextReviewAt)
      && isCount(value.stage) && isCount(value.correctCount) && isCount(value.wrongCount)
  } catch {
    return false
  }
}

function validLog(value: unknown): value is ReviewLog {
  if (!isRecord(value) || !isId(value.id) || (value.wordId !== null && !isId(value.wordId))
    || typeof value.word !== 'string' || !value.word.trim()
    || typeof value.meaning !== 'string' || !value.meaning.trim()
    || !validTimestamp(value.timestamp) || !validLocalDate(value.date)) return false
  if (value.mode === 'flashcard') {
    return ratings.some(rating => rating === value.rating) && value.sessionId === null && value.questionIndex === null
      && value.isCorrect === (value.rating === 'hard' ? null : value.rating === 'good')
  }
  return value.mode === 'quiz' && value.rating === null && typeof value.isCorrect === 'boolean'
    && isId(value.sessionId) && isCount(value.questionIndex)
}

function validSession(value: unknown): value is QuizSession {
  if (!isRecord(value) || !isId(value.id) || !validTimestamp(value.timestamp)
    || !isCount(value.totalQuestions) || value.totalQuestions === 0
    || !isCount(value.correctAnswers) || !isCount(value.wrongAnswers)) return false
  const answered = value.correctAnswers + value.wrongAnswers
  return (value.quizType === 'en-zh' || value.quizType === 'zh-en' || value.quizType === 'spelling')
    && ((value.status === 'completed' && answered === value.totalQuestions)
      || (value.status === 'in_progress' && answered < value.totalQuestions))
}

function uniqueIds(records: { id: string }[]): boolean {
  return new Set(records.map(record => record.id)).size === records.length
}

export function validateBackup(value: unknown): Backup {
  if (!isRecord(value) || value.format !== 'vocabulary-trainer-backup' || value.version !== 1) {
    throw new Error('此檔案的備份格式或版本不受支援。')
  }
  const { exportedAt, words, reviewLogs, quizSessions, settings } = value
  if (!validTimestamp(exportedAt) || !validSettings(settings)
    || !Array.isArray(words) || !words.every(validWord)
    || !Array.isArray(reviewLogs) || !reviewLogs.every(validLog)
    || !Array.isArray(quizSessions) || !quizSessions.every(validSession)) {
    throw new Error('備份欄位、日期或設定不完整。')
  }
  if (!uniqueIds(words) || !uniqueIds(reviewLogs) || !uniqueIds(quizSessions)
    || new Set(words.map(word => word.normalizedWord)).size !== words.length) {
    throw new Error('備份包含重複的單字或紀錄。')
  }
  const wordIds = new Set(words.map(word => word.id))
  const sessions = new Map(quizSessions.map(session => [session.id, session]))
  const answers = new Map<string, { indexes: Set<number>; correct: number }>()
  for (const log of reviewLogs) {
    if (log.wordId !== null && !wordIds.has(log.wordId)) throw new Error('備份含有無法連結的單字紀錄。')
    if (log.sessionId === null || log.questionIndex === null) continue
    const session = sessions.get(log.sessionId)
    const entry = answers.get(log.sessionId) ?? { indexes: new Set<number>(), correct: 0 }
    if (!session || entry.indexes.has(log.questionIndex) || log.questionIndex >= session.totalQuestions || log.timestamp < session.timestamp) {
      throw new Error('備份含有無效或重複的測驗作答。')
    }
    entry.indexes.add(log.questionIndex)
    entry.correct += Number(log.isCorrect)
    answers.set(log.sessionId, entry)
  }
  for (const session of quizSessions) {
    const entry = answers.get(session.id)
    const total = (entry?.indexes.size ?? 0)
    const correct = entry?.correct ?? 0
    if (correct !== session.correctAnswers || total - correct !== session.wrongAnswers
      || [...(entry?.indexes ?? [])].some(index => index >= total)) throw new Error('備份中的測驗分數與作答紀錄不一致。')
  }
  return { format: 'vocabulary-trainer-backup', version: 1, exportedAt, words, reviewLogs, quizSessions, settings }
}

export function parseBackup(text: string): Backup {
  return validateBackup(JSON.parse(text.replace(/^\uFEFF/, '')))
}
