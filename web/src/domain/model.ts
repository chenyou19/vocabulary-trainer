export type Rating = 'again' | 'hard' | 'good'
export type QuizType = 'en-zh' | 'zh-en' | 'spelling'
export type Direction = 'en-zh' | 'zh-en'
export type Theme = 'light' | 'dark'

export interface Settings {
  dailyGoal: number
  theme: Theme
}

export interface WordInput {
  word: string
  meaning: string
  partOfSpeech: string
  example: string
  exampleTranslation: string
  tags: string[]
  sourceEntries?: SourceEntry[]
}

export interface SourceEntry {
  english_word: string
  chinese_definition: string
  category?: string
  star_rating?: number
  toeic_score_range?: string
  parts_of_speech?: string[]
  examples?: { english: string; chinese: string }[]
  word_forms?: { part_of_speech: string; forms: string[] }[]
  exam_tips?: string[]
}

export interface Word extends WordInput {
  id: string
  normalizedWord: string
  createdAt: string
  updatedAt: string
  stage: number
  nextReviewAt: string
  correctCount: number
  wrongCount: number
}

export interface ReviewLog {
  id: string
  wordId: string | null
  word: string
  meaning: string
  timestamp: string
  date: string
  mode: 'flashcard' | 'quiz'
  rating: Rating | null
  isCorrect: boolean | null
  sessionId: string | null
  questionIndex: number | null
}

export interface QuizSession {
  id: string
  timestamp: string
  quizType: QuizType
  totalQuestions: number
  correctAnswers: number
  wrongAnswers: number
  status: 'in_progress' | 'completed'
}

export interface QuizQuestion {
  wordId: string
  word: string
  meaning: string
  prompt: string
  answer: string
  options: string[]
  optionExplanations?: { option: string; word: string; meaning: string }[]
}

export const defaultSettings: Settings = { dailyGoal: 20, theme: 'light' }
export const quizLabels: Record<QuizType, string> = { 'en-zh': '英翻中', 'zh-en': '中翻英', spelling: '拼字測驗' }
export const ratings: readonly Rating[] = ['again', 'hard', 'good']

export function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function stageLabel(stage: number): string {
  if (stage === 0) return '起步'
  if (stage <= 2) return '熟悉中'
  if (stage <= 4) return '逐漸熟練'
  return '已熟練'
}
