import { parseWordJson } from '../domain/import'

export async function fetchProjectVocabulary() {
  const response = await fetch(`${import.meta.env.BASE_URL}data/toeic_vocabulary.json`)
  if (!response.ok) throw new Error('無法下載專案 TOEIC 詞庫。')
  return parseWordJson(await response.text())
}

export async function loadInitialVocabulary() {
  const { words, invalid } = await fetchProjectVocabulary()
  if (invalid > 0 || words.length === 0) throw new Error('專案 TOEIC 詞庫不完整。')
  return words
}
