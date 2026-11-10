import { normalizeText } from './model'
import type { QuizQuestion, QuizType, Word } from './model'

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

export function matchesSpelling(entered: string, expected: string): boolean {
  return entered.trim().toLowerCase() === expected.trim().toLowerCase()
}

function meaningKeys(word: Word): Set<string> {
  const meanings = [word.meaning, ...(word.sourceEntries?.map(entry => entry.chinese_definition) ?? [])]
  return new Set(meanings.flatMap(meaning => {
    const withoutNotes = meaning.normalize('NFKC').replace(/\([^()]*\)/g, '')
    return [meaning, ...withoutNotes.split(/[;；,，、。/／\n]/)].map(normalizeText).filter(Boolean)
  }))
}

export function buildQuiz(
  candidates: readonly Word[],
  pool: readonly Word[],
  type: QuizType,
  count: number,
  random = Math.random,
): QuizQuestion[] {
  const answerFor = (word: Word) => type === 'en-zh' ? word.meaning : word.word
  const promptFor = (word: Word) => type === 'en-zh' ? word.word : word.meaning
  const choices = new Map<string, Word>()
  const wordsByMeaning = new Map<string, Set<string>>()
  const meaningsByWord = new Map<string, Set<string>>()

  for (const word of pool) {
    const answer = normalizeText(answerFor(word))
    if (!choices.has(answer)) choices.set(answer, word)
    const meanings = meaningKeys(word)
    meaningsByWord.set(word.id, meanings)
    for (const meaning of meanings) {
      const group = wordsByMeaning.get(meaning) ?? new Set<string>()
      group.add(word.id)
      wordsByMeaning.set(meaning, group)
    }
  }

  const possibleChoices = [...choices]
  if (type !== 'spelling' && possibleChoices.length < 4) return []
  const questions: QuizQuestion[] = []
  const usedPrompts = new Set<string>()
  for (const word of shuffled(candidates, random)) {
    if (questions.length === count) break
    const prompt = promptFor(word)
    const promptKey = normalizeText(prompt)
    if (usedPrompts.has(promptKey)) continue
    const answer = answerFor(word)
    const answerKey = normalizeText(answer)
    const meanings = meaningsByWord.get(word.id) ?? meaningKeys(word)
    const equivalentWords = new Set<string>()
    for (const meaning of meanings) {
      for (const id of wordsByMeaning.get(meaning) ?? []) {
        if (id !== word.id) equivalentWords.add(id)
      }
    }
    if (type === 'spelling' && equivalentWords.size > 0) continue

    let selected: Word[] = []
    if (type !== 'spelling') {
      const distractors: Word[] = []
      for (const [key, candidate] of shuffled(possibleChoices, random)) {
        if (key === answerKey || equivalentWords.has(candidate.id)) continue
        // In English-to-Chinese quizzes the displayed definition can belong to more than one word.
        if (type === 'en-zh' && meanings.has(key)) continue
        distractors.push(candidate)
        if (distractors.length === 3) break
      }
      if (distractors.length < 3) continue
      selected = shuffled([word, ...distractors], random)
    }
    usedPrompts.add(promptKey)
    const optionExplanations = selected.map(choice => ({ option: answerFor(choice), word: choice.word, meaning: choice.meaning }))
    questions.push({
      wordId: word.id, word: word.word, meaning: word.meaning, prompt, answer,
      options: optionExplanations.map(choice => choice.option), optionExplanations,
    })
  }
  return questions
}
