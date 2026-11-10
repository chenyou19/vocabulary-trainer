import type { Word } from './model'

export const priorityLevels = [5, 4, 3, 2, 1, 0] as const
export const priorityBatchSize = 50
export type PriorityLevel = typeof priorityLevels[number]
export type PracticeScope = 'today' | 'due' | 'all'

export interface PrioritySelection {
  tier: PriorityLevel | null
  batch: number | null
}

interface PriorityBatch {
  key: string
  number: number
  words: Word[]
}

interface PriorityTier {
  level: PriorityLevel
  words: Word[]
  batches: PriorityBatch[]
}

export const allPriority: PrioritySelection = { tier: null, batch: null }

export function wordPriority(word: Pick<Word, 'sourceEntries'>): PriorityLevel {
  let result: PriorityLevel = 0
  for (const source of word.sourceEntries ?? []) {
    const level = priorityLevels.find(value => value === source.star_rating)
    if (level !== undefined && level > result) result = level
  }
  return result
}

export function priorityLabel(level: PriorityLevel): string {
  return level ? `${level} 星` : '未分級'
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function shuffleKey(normalizedWord: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < normalizedWord.length; index++) {
    hash = Math.imul(hash ^ normalizedWord.charCodeAt(index), 0x01000193)
  }
  // Mix the bits so similar spellings disperse while each word keeps a stable position.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) >>> 0
}

function compareWords(a: Word, b: Word): number {
  return shuffleKey(a.normalizedWord) - shuffleKey(b.normalizedWord)
    || compareText(a.normalizedWord, b.normalizedWord) || compareText(a.id, b.id)
}

export function comparePriority(a: Word, b: Word): number {
  return wordPriority(b) - wordPriority(a) || compareWords(a, b)
}

export function groupPriority(words: readonly Word[]): PriorityTier[] {
  const buckets = new Map<PriorityLevel, Word[]>(priorityLevels.map(level => [level, []]))
  for (const word of words) buckets.get(wordPriority(word))!.push(word)
  return priorityLevels.map(level => {
    const sorted = buckets.get(level)!.sort(compareWords)
    const batches = Array.from({ length: Math.ceil(sorted.length / priorityBatchSize) }, (_, index) => {
      const number = index + 1
      return {
        key: `star-${level}-batch-${String(number).padStart(3, '0')}`,
        number,
        words: sorted.slice(index * priorityBatchSize, number * priorityBatchSize),
      }
    })
    return { level, words: sorted, batches }
  })
}

export function selectPriority(tiers: readonly PriorityTier[], selection: PrioritySelection): Word[] {
  if (selection.tier === null) return tiers.flatMap(tier => tier.words)
  const tier = tiers.find(item => item.level === selection.tier)
  return selection.batch === null ? tier?.words ?? [] : tier?.batches[selection.batch - 1]?.words ?? []
}

export function readPriority(params: URLSearchParams): PrioritySelection {
  const tier = priorityLevels.find(level => String(level) === params.get('tier')) ?? null
  const raw = params.get('batch')
  const batch = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null
  return { tier, batch: tier !== null && Number.isSafeInteger(batch) ? batch : null }
}

export function prioritySearch(selection: PrioritySelection): string {
  if (selection.tier === null) return ''
  const params = new URLSearchParams({ tier: String(selection.tier) })
  if (selection.batch !== null) params.set('batch', String(selection.batch))
  return `?${params}`
}

export function priorityProgress(words: readonly Word[], learnedIds: ReadonlySet<string>, today: string) {
  let learned = 0
  let due = 0
  let proficient = 0
  for (const word of words) {
    if (learnedIds.has(word.id)) {
      learned++
      if (word.nextReviewAt <= today) due++
    }
    if (word.stage >= 5) proficient++
  }
  return { total: words.length, learned, due, fresh: words.length - learned, proficient }
}

export function orderPracticeWords(
  words: readonly Word[], learnedIds: ReadonlySet<string>, today: string, scope: PracticeScope,
): Word[] {
  const due: Word[] = []
  const fresh: Word[] = []
  const upcoming: Word[] = []
  for (const word of words) {
    if (!learnedIds.has(word.id)) fresh.push(word)
    else if (word.nextReviewAt <= today) due.push(word)
    else upcoming.push(word)
  }
  const byReviewDate = (a: Word, b: Word) => compareText(a.nextReviewAt, b.nextReviewAt) || comparePriority(a, b)
  due.sort(byReviewDate)
  if (scope === 'due') return due
  const ordered = due.concat(fresh.sort(comparePriority))
  return scope === 'all' ? ordered.concat(upcoming.sort(byReviewDate)) : ordered
}
