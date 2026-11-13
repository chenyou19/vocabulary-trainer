import { normalizeText } from '../domain/model'
import type { Word, WordInput } from '../domain/model'
import type { PdfList } from './pdf-vocabulary'
import { makeWord, repository } from './repository'

export function pdfPracticeInputs(list: PdfList): WordInput[] {
  const inputs = new Map<string, WordInput>()
  for (const [word, meaning] of list.entries) {
    const key = normalizeText(word)
    const previous = inputs.get(key)
    if (!previous) {
      inputs.set(key, { word, meaning, partOfSpeech: '', example: '', exampleTranslation: '', tags: ['PDF 單字'] })
    } else if (!previous.meaning.split('；').includes(meaning)) {
      previous.meaning += `；${meaning}`
    }
  }
  return [...inputs.values()]
}

export function pdfPracticeWords(inputs: readonly WordInput[], stored: readonly Word[], today: string): Word[] {
  const byWord = new Map(stored.map(word => [word.normalizedWord, word]))
  const date = new Date(`${today}T12:00:00`)
  return inputs.map(input => {
    const key = normalizeText(input.word)
    const progress = byWord.get(key) ?? makeWord(input, date, `pdf-preview:${key}`)
    return { ...progress, ...input, sourceEntries: undefined }
  })
}

export async function savePdfPracticeWords(words: readonly Word[]): Promise<Word[]> {
  const stored = await repository.ensurePracticeWords(words)
  return words.map((word, index) => ({ ...stored[index], word: word.word, meaning: word.meaning,
    partOfSpeech: word.partOfSpeech, example: word.example, exampleTranslation: word.exampleTranslation, sourceEntries: undefined,
  }))
}
