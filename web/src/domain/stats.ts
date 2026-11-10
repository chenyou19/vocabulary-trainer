import { localDate, shiftDate } from './dates'
import { normalizeText } from './model'
import type { ReviewLog, Word } from './model'

export function accuracy(correct: number, attempts: number): number | null {
  return attempts > 0 ? Math.round(correct * 100 / attempts) : null
}

export function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

export function learnedWordIds(logs: readonly ReviewLog[]): Set<string> {
  const ids = new Set<string>()
  for (const log of logs) {
    if (log.wordId !== null) ids.add(log.wordId)
  }
  return ids
}

export function summarize(words: readonly Word[], logs: readonly ReviewLog[], now = new Date()) {
  const today = localDate(now)
  const dates = Array.from({ length: 7 }, (_, index) => localDate(shiftDate(now, index - 6)))
  const daily = new Map(dates.map(date => [date, { ids: new Set<string>(), correct: 0, answers: 0 }]))
  const learnedIds = learnedWordIds(logs)
  const missed = new Map<string, { word: string; meaning: string; count: number }>()
  const currentWords = new Map(words.map(word => [word.id, word]))
  let quizCorrect = 0
  let quizAnswers = 0

  for (const log of logs) {
    const dailyRecord = daily.get(log.date)
    const word = log.wordId ? currentWords.get(log.wordId) ?? log : log
    const key = normalizeText(word.word)
    dailyRecord?.ids.add(key)
    if (log.mode === 'quiz') {
      quizAnswers++
      if (log.isCorrect) quizCorrect++
      if (dailyRecord) {
        dailyRecord.answers++
        if (log.isCorrect) dailyRecord.correct++
      }
    }
    if (log.isCorrect === false) {
      const entry = missed.get(key) ?? { word: word.word, meaning: word.meaning, count: 0 }
      entry.count++
      missed.set(key, entry)
    }
  }

  const week = dates.map(date => {
    const { ids, correct, answers } = daily.get(date)!
    return { date, learned: ids.size, accuracy: accuracy(correct, answers), answers }
  })
  const last = week[week.length - 1]
  const learned = words.filter(word => learnedIds.has(word.id))

  return {
    total: words.length,
    due: learned.filter(word => word.nextReviewAt <= today).length,
    learned: learned.length,
    fresh: words.length - learned.length,
    attempts: logs.length,
    todayLearned: last.learned,
    todayAccuracy: last.accuracy,
    quizAccuracy: accuracy(quizCorrect, quizAnswers),
    week,
    mistakes: [...missed.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, 8),
    stages: [
      { label: '起步', count: words.filter(word => word.stage === 0).length },
      { label: '熟悉中', count: words.filter(word => word.stage >= 1 && word.stage <= 2).length },
      { label: '逐漸熟練', count: words.filter(word => word.stage >= 3 && word.stage <= 4).length },
      { label: '已熟練', count: words.filter(word => word.stage >= 5).length },
    ],
  }
}
