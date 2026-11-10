import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Download, FileJson, LibraryBig, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PriorityMark, PriorityPicker, usePrioritySelection } from '../components/priority-picker'
import { Confirm, EmptyState, ErrorNotice, Loading, Modal, PageHeading, downloadFile, errorMessage } from '../components/ui'
import { useLearningData, useToday } from '../data/hooks'
import { fetchProjectVocabulary } from '../data/project-vocabulary'
import { repository } from '../data/repository'
import { localDate } from '../domain/dates'
import { csvExample, parseWordCsv, parseWordJson, splitTags, wordListJson } from '../domain/import'
import type { ImportPreview } from '../domain/import'
import { normalizeText, stageLabel } from '../domain/model'
import type { Word } from '../domain/model'
import { allPriority, priorityLabel, priorityProgress, prioritySearch } from '../domain/priority'
import { learnedWordIds } from '../domain/stats'

const pageSize = 12
const emptyWord = { word: '', meaning: '', partOfSpeech: '', example: '', exampleTranslation: '', tags: [] }

function WordEditor({ word, onClose, onSaved }: { word: Word | null; onClose: () => void; onSaved: (message: string) => void }) {
  const initial = word ?? emptyWord
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const input = {
      word: form.get('word'), meaning: form.get('meaning'), partOfSpeech: form.get('partOfSpeech'),
      example: form.get('example'), exampleTranslation: form.get('exampleTranslation'), tags: splitTags(String(form.get('tags') ?? '')),
    }
    setBusy(true)
    setError('')
    try {
      if (word) await repository.updateWord(word.id, input)
      else await repository.addWord(input)
      onSaved(word ? '單字已更新。' : '已新增單字。')
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, '儲存失敗，請再試一次。'))
      setBusy(false)
    }
  }

  return <Modal title={word ? '編輯單字' : '新增單字'} onClose={onClose} busy={busy}>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">英文單字 <span aria-hidden="true">*</span><input name="word" lang="en" defaultValue={initial.word} required maxLength={180} autoFocus /></label>
        <label className="field">中文意思 <span aria-hidden="true">*</span><input name="meaning" defaultValue={initial.meaning} required maxLength={2000} /></label>
        <label className="field">詞性<input name="partOfSpeech" placeholder="例如：名詞" defaultValue={initial.partOfSpeech} maxLength={100} /></label>
        <label className="field">分類標籤<input name="tags" placeholder="以逗號分隔" defaultValue={initial.tags.join('，')} /></label>
      </div>
      <label className="field">英文例句<textarea name="example" lang="en" defaultValue={initial.example} rows={2} maxLength={4000} /></label>
      <label className="field">例句中文翻譯<textarea name="exampleTranslation" defaultValue={initial.exampleTranslation} rows={2} maxLength={4000} /></label>
      {word && <p className="muted text-sm">建立日期 {localDate(new Date(word.createdAt))} · 第 {word.stage} 階段 · 下次複習 {word.nextReviewAt} · 答對 {word.correctCount} 次 · 答錯 {word.wrongCount} 次</p>}
      {Boolean(word?.sourceEntries?.length) && <details className="source-details"><summary>查看原詞庫資料（{word?.sourceEntries?.length} 筆）</summary>
        {word?.sourceEntries?.map((entry, index) => <section key={index} className="source-entry">
          <p><strong lang="en">{entry.english_word}</strong> · {entry.chinese_definition}</p>
          <p className="muted">{[entry.category, entry.parts_of_speech?.join('、'), entry.star_rating ? `${entry.star_rating} 星` : '', entry.toeic_score_range].filter(Boolean).join(' · ')}</p>
          {entry.word_forms?.map((form, i) => <p key={i} lang="en">{form.part_of_speech} · {form.forms.join(', ')}</p>)}
          {entry.examples?.map((example, i) => <p key={i}><span lang="en">{example.english}</span><br />{example.chinese}</p>)}
          {entry.exam_tips?.map((tip, i) => <p key={i}>{tip}</p>)}
        </section>)}
      </details>}
      {error && <ErrorNotice message={error} />}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? '儲存中…' : '儲存單字'}</button></div>
    </form>
  </Modal>
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [paste, setPaste] = useState('')

  async function inspect(load: () => Promise<ImportPreview>) {
    if (busy) return
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      setPreview(await load())
    } catch (failure) {
      setError(errorMessage(failure, '無法解析檔案，請確認檔案格式。'))
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!preview || !preview.words.length || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await repository.importWords(preview.words)
      onImported(`匯入完成：新增 ${result.added.toLocaleString('zh-TW')} 筆，已有 ${result.existing.toLocaleString('zh-TW')} 筆，略過 ${preview.invalid} 筆格式錯誤。`)
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, '匯入失敗，請檢查瀏覽器的儲存空間後再試。'))
      setBusy(false)
    }
  }

  return <Modal title="匯入與批次新增" onClose={onClose} busy={busy}>
    <div className="form-stack">
      <div className="import-source">
        <span className="tile-icon"><LibraryBig size={20} /></span>
        <div><h3>專案 TOEIC 詞庫</h3><p>讀取專案附帶的單字、分類、例句與來源註記。</p></div>
        <button type="button" className="button button-secondary" onClick={() => void inspect(fetchProjectVocabulary)} disabled={busy}>匯入專案 TOEIC 詞庫</button>
      </div>
      <label className="field">選擇 JSON 或 CSV 檔<input type="file" accept=".json,.csv,application/json,text/csv" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void inspect(async () => {
          const text = await file.text()
          return file.name.toLowerCase().endsWith('.csv') ? parseWordCsv(text) : parseWordJson(text)
        })
      }} /></label>
      <button type="button" className="text-button self-start" onClick={() => downloadFile('vocabulary-example.csv', csvExample, 'text/csv;charset=utf-8')}><Download size={16} />下載 CSV 格式範例</button>
      <label className="field">或貼上 JSON／CSV<textarea rows={3} value={paste} onChange={event => setPaste(event.target.value)} placeholder="word,meaning&#10;schedule,行程表" disabled={busy} /></label>
      <button type="button" className="button button-secondary self-start" disabled={!paste.trim() || busy} onClick={() => {
        const first = paste.trim().charAt(0)
        void inspect(async () => first === '[' || first === '{' ? parseWordJson(paste) : parseWordCsv(paste))
      }}>檢查貼上的資料</button>
      {busy && <p role="status" className="muted">正在處理詞庫，請稍候…</p>}
      {preview && <div className="notice notice-info" role="status">
        <div><strong>可匯入 {preview.words.length.toLocaleString('zh-TW')} 個不同單字</strong>
          <p>檔內重複 {preview.duplicates.toLocaleString('zh-TW')} 筆，格式錯誤 {preview.invalid} 筆。同名詞條會合併來源資料，並保留現有單字內容及進度。</p>
          {preview.errors.length > 0 && <ul>{preview.errors.map(error => <li key={error}>{error}</li>)}</ul>}
        </div>
      </div>}
      {error && <ErrorNotice message={error} />}
      <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>取消</button>
        <button type="button" className="button button-primary" onClick={apply} disabled={busy || !preview?.words.length}><Upload size={17} />確認匯入</button></div>
    </div>
  </Modal>
}

export function Vocabulary() {
  const data = useLearningData()
  const words = data?.words
  const today = useToday()
  const { tiers, selection, selectedWords, setSelection } = usePrioritySelection(words)
  const learnedIds = useMemo(() => learnedWordIds(data?.reviewLogs ?? []), [data?.reviewLogs])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [order, setOrder] = useState('priority')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<Word | null | undefined>(undefined)
  const [removing, setRemoving] = useState<Word | null>(null)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const categories = useMemo(() => [...new Set(words?.flatMap(word => word.tags))].sort((a, b) => a.localeCompare(b, 'zh-TW')), [words])
  const filtered = useMemo(() => {
    const key = normalizeText(query)
    const matches = selectedWords.filter(word =>
      (!category || word.tags.includes(category))
      && (!key || [word.word, word.meaning, ...word.tags].some(value => normalizeText(value).includes(key))
        || word.sourceEntries?.some(entry => normalizeText(entry.chinese_definition).includes(key))),
    )
    if (order === 'priority') return matches
    return matches.sort((a, b) => {
      if (order === 'learning') return a.stage - b.stage || a.nextReviewAt.localeCompare(b.nextReviewAt) || a.word.localeCompare(b.word)
      const byDate = a.createdAt.localeCompare(b.createdAt)
      return (order === 'newest' ? -byDate : byDate) || a.word.localeCompare(b.word)
    })
  }, [selectedWords, query, category, order])
  const progress = selection.tier !== null && selectedWords.length ? priorityProgress(selectedWords, learnedIds, today) : null
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return <div className="page">
    <PageHeading label="管理單字" title="單字庫" description="收錄想記住的單字、例句和分類，建立自己的詞庫。"
      action={<><button className="button button-secondary" type="button" onClick={() => setImporting(true)}><Upload size={17} />匯入單字</button>
        <button className="button button-primary" type="button" onClick={() => setEditor(null)}><Plus size={18} />新增單字</button></>} />
    {message && <p className="notice notice-success" role="status">{message}</p>}
    {!words ? <Loading /> : <>
      {words.length > 0 && <PriorityPicker tiers={tiers} selection={selection} overview onChange={next => { setSelection(next); setPage(1) }} />}
      {progress && selection.tier !== null && <section className="panel priority-progress">
        <div>
          <h2>{priorityLabel(selection.tier)}{selection.batch !== null ? ` · 第 ${selection.batch} 組` : ''}</h2>
          <p>已練習 {progress.learned} / {progress.total} 個 · 到期 {progress.due} 個 · 新單字 {progress.fresh} 個 · 已熟練 {progress.proficient} 個</p>
          <div className="progress-track" role="progressbar" aria-label="分組練習進度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.learned}>
            <span style={{ width: `${progress.learned / progress.total * 100}%` }} />
          </div>
        </div>
        <div className="priority-actions">
          <Link className="button button-primary" to={`/flashcards${prioritySearch(selection)}`}>{selection.batch === null ? '背這個星級' : '背這組'}</Link>
          <Link className="button button-secondary" to={`/quiz${prioritySearch(selection)}`}>{selection.batch === null ? '測驗這個星級' : '測驗這組'}</Link>
        </div>
      </section>}
      <section className="panel library-controls" aria-label="搜尋與篩選單字">
        <label className="search-field"><Search size={19} /><span className="sr-only">搜尋單字</span>
          <input value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder="搜尋英文、中文或標籤" type="search" />
        </label>
        <label className="filter-field"><span className="sr-only">篩選分類</span><select value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}>
          <option value="">所有分類</option>{categories.map(tag => <option key={tag}>{tag}</option>)}
        </select></label>
        <label className="filter-field"><span className="sr-only">排序方式</span><select value={order} onChange={event => { setOrder(event.target.value); setPage(1) }}>
          <option value="priority">來源星級由高至低</option><option value="newest">最新新增</option><option value="oldest">最早新增</option><option value="learning">熟練度由低至高</option>
        </select></label>
      </section>
      <div className="list-toolbar"><span>顯示 {filtered.length.toLocaleString('zh-TW')} 個單字</span>
        <button type="button" className="text-button" disabled={!words.length} onClick={() => downloadFile(`vocabulary-${localDate()}.json`, wordListJson(words), 'application/json')}><FileJson size={17} />匯出單字 JSON</button>
      </div>
      {visible.length === 0 ? <EmptyState title={words.length ? '找不到符合的單字' : '你的單字庫還是空的'}
        description={words.length ? '試試其他關鍵字，或調整星級、分組及分類。' : '新增一個想記住的單字，或匯入專案附帶的 TOEIC 詞庫。'}
        action={words.length ? <button className="button button-secondary" onClick={() => { setQuery(''); setCategory(''); setSelection(allPriority); setPage(1) }}>清除篩選</button>
          : <button className="button button-primary" onClick={() => setImporting(true)}><BookOpen size={17} />匯入 TOEIC 詞庫</button>} />
        : <div className="panel vocabulary-list">
          {visible.map(word => <article className="word-row" key={word.id}>
            <div className="word-primary"><h2 lang="en">{word.word}</h2><p>{word.meaning}{word.partOfSpeech && <span className="part-of-speech"> · {word.partOfSpeech}</span>}</p>
              <div className="tags"><PriorityMark word={word} />{word.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div></div>
            <div className="word-progress"><span className={`stage stage-${Math.min(3, Math.ceil(word.stage / 2))}`}>{stageLabel(word.stage)}</span>
              <small>複習 {word.nextReviewAt}</small></div>
            <div className="row-actions">
              <button className="icon-button" aria-label={`編輯 ${word.word}`} title="編輯" onClick={() => setEditor(word)}><Pencil size={17} /></button>
              <button className="icon-button danger-icon" aria-label={`刪除 ${word.word}`} title="刪除" onClick={() => setRemoving(word)}><Trash2 size={17} /></button>
            </div>
          </article>)}
        </div>}
      {pageCount > 1 && <nav className="pagination" aria-label="單字列表分頁">
        <button className="icon-button" aria-label="上一頁" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={20} /></button>
        <span>第 {currentPage} / {pageCount} 頁</span>
        <button className="icon-button" aria-label="下一頁" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={20} /></button>
      </nav>}
    </>}
    {editor !== undefined && <WordEditor word={editor} onClose={() => setEditor(undefined)} onSaved={setMessage} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onImported={text => { setMessage(text); setPage(1) }} />}
    {removing && <Confirm title="刪除單字" action="刪除單字" onClose={() => setRemoving(null)} onConfirm={async () => {
      await repository.removeWord(removing.id)
      setMessage('單字已刪除。')
    }}><p>確定要刪除 <strong lang="en">{removing.word}</strong>？過去的練習紀錄仍會保留。</p></Confirm>}
  </div>
}
