import { useState } from 'react'
import { Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, PageHeading } from '../components/ui'
import { pdfLists, pdfVocabulary } from '../data/pdf-vocabulary'
import { normalizeText } from '../domain/model'

export function PdfVocabulary() {
  const [chapter, setChapter] = useState('')
  const [params, setParams] = useSearchParams()
  const listNumber = pdfLists.find(list => String(list.number) === params.get('list'))?.number.toString() ?? ''
  const [query, setQuery] = useState('')
  const key = normalizeText(query.replaceAll('’', "'"))
  const lists = pdfLists.filter(list => !chapter || list.chapter === chapter)
  const results = lists
    .filter(list => !listNumber || String(list.number) === listNumber)
    .map(list => ({
      ...list,
      matches: list.entries
        .map(([word, meaning], index) => ({ word, meaning, index }))
        .filter(({ word, meaning }) => !key || [word, meaning].some(value => normalizeText(value).includes(key))),
    }))
    .filter(list => list.matches.length || (!list.entries.length && (listNumber || !key)))
  const count = results.reduce((total, list) => total + list.matches.length, 0)

  return <div className="page">
    <PageHeading label="教材詞彙" title="PDF 單字" description="《多益衝刺單字分類整理》（Chris）" />
    <section className="panel library-controls" aria-label="搜尋與篩選 PDF 單字">
      <label className="search-field"><Search size={19} aria-hidden="true" /><span className="sr-only">搜尋 PDF 單字</span>
        <input type="search" placeholder="搜尋英文或中文" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <label className="filter-field"><span className="sr-only">PDF 章節</span>
        <select value={chapter} onChange={event => { setChapter(event.target.value); setParams({}, { replace: true }) }}>
          <option value="">所有章節</option>
          {pdfVocabulary.map(({ title }) => <option key={title}>{title}</option>)}
        </select>
      </label>
      <label className="filter-field"><span className="sr-only">PDF List</span>
        <select value={listNumber} onChange={event => setParams(event.target.value ? { list: event.target.value } : {}, { replace: true })}>
          <option value="">所有 List</option>
          {lists.map(list => <option key={list.number} value={list.number}>List {list.number}{!list.entries.length && '（缺頁）'}</option>)}
        </select>
      </label>
    </section>
    <p className="list-toolbar" role="status">顯示 {count} 筆詞條</p>
    {results.length === 0 && <EmptyState title="找不到符合的詞條" description="試試其他關鍵字，或擴大章節與 List 範圍。" />}
    {results.map(list => <section className="panel pdf-list" key={list.number} aria-labelledby={`pdf-list-${list.number}`}>
      <div className="pdf-list-header">
        <div>
          <h2 id={`pdf-list-${list.number}`}>List {list.number}</h2>
          <p>{list.chapter} · 原書第 {list.printedPage} 頁</p>
        </div>
        {list.entries.length > 0 && <div className="priority-actions">
          <Link className="button button-primary" to={`/flashcards?pdfList=${list.number}`}>背這組</Link>
          <Link className="button button-secondary" to={`/quiz?pdfList=${list.number}`}>測驗這組</Link>
        </div>}
      </div>
      {list.entries.length ? <dl>
        {list.matches.map(({ word, meaning, index }) => <div className="pdf-word" key={index}>
          <dt lang="en">{word}</dt><dd>{meaning}</dd>
        </div>)}
      </dl> : <p className="notice notice-info">目錄列有這一組，但這份 PDF 缺少原書第 {list.printedPage} 頁。</p>}
    </section>)}
  </div>
}
