import Dexie, { type EntityTable } from 'dexie'
import type { QuizSession, ReviewLog, Settings, Word } from '../domain/model'

export class TrainerDatabase extends Dexie {
  words!: EntityTable<Word, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  quizSessions!: EntityTable<QuizSession, 'id'>
  settings!: EntityTable<Settings & { id: 'settings' }, 'id'>

  constructor(name = 'vocabulary-trainer') {
    super(name)
    this.version(1).stores({
      words: 'id, &normalizedWord, nextReviewAt, createdAt, *tags',
      reviewLogs: 'id, wordId, date, mode, &[sessionId+questionIndex]',
      quizSessions: 'id, timestamp, status',
      settings: 'id',
    })
  }
}

export const database = new TrainerDatabase()
