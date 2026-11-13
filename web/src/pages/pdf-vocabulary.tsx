import { useState } from 'react'
import { Search } from 'lucide-react'
import { EmptyState, PageHeading } from '../components/ui'
import { pdfVocabulary } from '../data/pdf-vocabulary'
import { normalizeText } from '../domain/model'

export function PdfVocabulary() {
  const [chapter, setChapter] = useState('')
  const [listNumber, setListNumber] = useState('')
  const [query, setQuery] = useState('')
  const key = normalizeText(query.replaceAll('’', "'"))
  const lists = pdfVocabulary
    .filter(item => !chapter || item.title === chapter)
    .flatMap(({ title, lists }) => lists.map(list => ({ ...list, chapter: title })))
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
        <select value={chapter} onChange={event => { setChapter(event.target.value); setListNumber('') }}>
          <option value="">所有章節</option>
          {pdfVocabulary.map(({ title }) => <option key={title}>{title}</option>)}
        </select>
      </label>
      <label className="filter-field"><span className="sr-only">PDF List</span>
        <select value={listNumber} onChange={event => setListNumber(event.target.value)}>
          <option value="">所有 List</option>
          {lists.map(list => <option key={list.number} value={list.number}>List {list.number}{!list.entries.length && '（缺頁）'}</option>)}
        </select>
      </label>
    </section>
    <p className="list-toolbar" role="status">顯示 {count} 筆詞條</p>
    {results.length === 0 && <EmptyState title="找不到符合的詞條" description="試試其他關鍵字，或擴大章節與 List 範圍。" />}
    {results.map(list => <section className="panel pdf-list" key={list.number} aria-labelledby={`pdf-list-${list.number}`}>
      <div className="pdf-list-header">
        <h2 id={`pdf-list-${list.number}`}>List {list.number}</h2>
        <p>{list.chapter} · 原書第 {list.printedPage} 頁</p>
      </div>
      {list.entries.length ? <dl>
        {list.matches.map(({ word, meaning, index }) => <div className="pdf-word" key={index}>
          <dt lang="en">{word}</dt><dd>{meaning}</dd>
        </div>)}
      </dl> : <p className="notice notice-info">目錄列有這一組，但這份 PDF 缺少原書第 {list.printedPage} 頁。</p>}
    </section>)}
  </div>
}
