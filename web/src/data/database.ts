import Dexie, { type EntityTable } from 'dexie'
import type { QuizSession, ReviewLog, Settings, Word } from '../domain/model'

export const vocabularyInitializationId = 'toeic-initialization'

export interface VocabularyInitialization {
  id: typeof vocabularyInitializationId
  reason: 'seeded' | 'existing' | 'cleared' | 'restored'
}

export class TrainerDatabase extends Dexie {
  words!: EntityTable<Word, 'id'>
  reviewLogs!: EntityTable<ReviewLog, 'id'>
  quizSessions!: EntityTable<QuizSession, 'id'>
  settings!: EntityTable<Settings & { id: 'settings' }, 'id'>
  metadata!: EntityTable<VocabularyInitialization, 'id'>

  constructor(name = 'vocabulary-trainer') {
    super(name)
    this.version(1).stores({
      words: 'id, &normalizedWord, nextReviewAt, createdAt, *tags',
      reviewLogs: 'id, wordId, date, mode, &[sessionId+questionIndex]',
      quizSessions: 'id, timestamp, status',
      settings: 'id',
    })
    this.version(2).stores({ metadata: 'id' })
  }
}

export const database = new TrainerDatabase()
