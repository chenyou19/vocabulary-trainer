import { localDate, shiftDate } from './dates'
import type { Rating, Word } from './model'

const intervals = [1, 3, 7, 14, 30, 60] as const

export function reviewInterval(stage: number): number {
  return intervals[Math.max(0, Math.min(stage - 1, intervals.length - 1))]
}

export function rateWord(
  word: Pick<Word, 'stage' | 'correctCount' | 'wrongCount'>,
  rating: Rating,
  now = new Date(),
): { stage: number; nextReviewAt: string; correctCount: number; wrongCount: number; isCorrect: boolean | null } {
  const stage = rating === 'again' ? 0 : rating === 'good' ? word.stage + 1 : word.stage
  const days = rating === 'good' ? reviewInterval(stage) : 1
  return {
    stage,
    nextReviewAt: localDate(shiftDate(now, days)),
    correctCount: word.correctCount + Number(rating === 'good'),
    wrongCount: word.wrongCount + Number(rating === 'again'),
    isCorrect: rating === 'hard' ? null : rating === 'good',
  }
}
