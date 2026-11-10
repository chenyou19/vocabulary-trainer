import { useMemo } from 'react'
import { Star } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { groupPriority, priorityLabel, prioritySearch, readPriority, selectPriority, wordPriority } from '../domain/priority'
import type { PriorityLevel, PrioritySelection } from '../domain/priority'
import type { Word } from '../domain/model'

export function usePrioritySelection(words: readonly Word[] | undefined) {
  const [params, setParams] = useSearchParams()
  const tiers = useMemo(() => groupPriority(words ?? []), [words])
  const selection = useMemo(() => readPriority(params), [params])
  const selectedWords = useMemo(() => selectPriority(tiers, selection), [tiers, selection])
  const setSelection = (next: PrioritySelection) => {
    setParams(prioritySearch(next), { replace: true, preventScrollReset: true })
  }
  return { tiers, selection, selectedWords, setSelection }
}

export function PriorityPicker({ tiers, selection, onChange, overview = false }: {
  tiers: ReturnType<typeof groupPriority>
  selection: PrioritySelection
  onChange: (selection: PrioritySelection) => void
  overview?: boolean
}) {
  const tier = tiers.find(item => item.level === selection.tier)
  const options = tiers.filter(item => item.level !== 0 || item.words.length || selection.tier === 0)
  const missingBatch = selection.batch !== null && !tier?.batches[selection.batch - 1]
  const selectTier = (level: PriorityLevel | null) => onChange({ tier: level, batch: null })
  return <section className={`priority-picker ${overview ? 'panel priority-overview' : 'priority-compact'}`} aria-label="來源優先分組">
    <div className="panel-heading">
      <span className="tile-icon tone-amber"><Star size={19} /></span>
      <div><h2>來源優先分組</h2><p>先背高星級，同星級採固定的打散順序，每組最多 50 個單字。</p></div>
    </div>
    {overview && <div className="priority-tiers">
      {options.map(item => <button key={item.level} type="button" className="priority-tier"
        aria-pressed={selection.tier === item.level} onClick={() => selectTier(item.level)}>
        <strong>{priorityLabel(item.level)}</strong>
        <span>{item.words.length.toLocaleString('zh-TW')} 個 · {item.batches.length} 組</span>
      </button>)}
    </div>}
    <div className="priority-fields">
      <label className="field">來源星級<select value={selection.tier ?? ''} onChange={event => {
        selectTier(event.target.value === '' ? null : Number(event.target.value) as PriorityLevel)
      }}>
        <option value="">所有星級</option>
        {options.map(item => <option key={item.level} value={item.level}>
          {priorityLabel(item.level)}（{item.words.length.toLocaleString('zh-TW')} 個）
        </option>)}
      </select></label>
      <label className="field">學習分組<select value={selection.batch ?? ''} disabled={selection.tier === null}
        onChange={event => onChange({ tier: selection.tier, batch: event.target.value ? Number(event.target.value) : null })}>
        <option value="">{selection.tier === null ? '先選擇來源星級' : '此星級的所有分組'}</option>
        {tier?.batches.map(batch => <option key={batch.key} value={batch.number}>第 {batch.number} 組（{batch.words.length} 個）</option>)}
        {missingBatch && <option value={selection.batch!}>第 {selection.batch} 組（已不存在）</option>}
      </select></label>
    </div>
  </section>
}

export function PriorityMark({ word }: { word: Word }) {
  const level = wordPriority(word)
  return <span className={`tag priority-mark ${level ? 'priority-mark-rated' : ''}`}>
    {level > 0 && <Star size={12} aria-hidden="true" />}{priorityLabel(level)}
  </span>
}
