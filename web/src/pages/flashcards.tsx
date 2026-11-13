import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Brain, Check, CircleHelp, Layers, RotateCcw, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { MissingPdfList, PdfPracticeLink } from '../components/pdf-practice'
import { AddWordsLink, EmptyState, ErrorNotice, Loading, PageHeading, SpeakButton, errorMessage } from '../components/ui'
import { PriorityMark, PriorityPicker, usePrioritySelection } from '../components/priority-picker'
import { useLearningData, useToday } from '../data/hooks'
import { pdfPracticeInputs, pdfPracticeWords, savePdfPracticeWords } from '../data/pdf-practice'
import { findPdfList } from '../data/pdf-vocabulary'
import type { PdfList } from '../data/pdf-vocabulary'
import { repository } from '../data/repository'
import type { Direction, Rating, Word } from '../domain/model'
import { allPriority, orderPracticeWords, priorityProgress } from '../domain/priority'
import type { PracticeScope } from '../domain/priority'
import { learnedWordIds } from '../domain/stats'

type QueueEntry = { word: Word; logId: string; replay: boolean }

function entry(word: Word, replay = false): QueueEntry {
  return { word, logId: crypto.randomUUID(), replay }
}

function StudyRound({ initial, direction, onExit, pdfList }: { initial: Word[]; direction: Direction; onExit: () => void; pdfList?: PdfList }) {
  const [queue, setQueue] = useState(() => initial.map(word => entry(word)))
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(new Map<string, { word: Word; rating: Rating }>())
  const lock = useRef(false)
  const flipButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const current: QueueEntry | undefined = queue[index]
  const englishFirst = direction === 'en-zh'
  const weak = [...results.values()].filter(item => item.rating !== 'good').map(item => item.word)
  const progress = Math.round(index * 100 / queue.length)

  useEffect(() => {
    if (current) flipButton.current?.focus({ preventScroll: true })
    else heading.current?.focus({ preventScroll: true })
  }, [current])

  async function grade(rating: Rating) {
    if (!current || !flipped || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await repository.rate(current.word.id, rating, current.logId, undefined, pdfList ? current.word : undefined)
      setResults(previous => new Map(previous).set(current.word.id, { word: current.word, rating }))
      if (rating === 'again') setQueue(previous => [...previous, entry(current.word, true)])
      setFlipped(false)
      setIndex(value => value + 1)
    } catch (failure) {
      setError(errorMessage(failure, '無法儲存複習結果。請再試一次。'))
    } finally {
      setBusy(false)
      lock.current = false
    }
  }

  function retry() {
    setQueue(weak.map(word => entry(word)))
    setIndex(0)
    setFlipped(false)
    setResults(new Map())
    setError('')
  }

  if (!current) return <section className="panel result-panel">
    <span className="result-icon"><Sparkles size={34} /></span>
    <h2 ref={heading} tabIndex={-1}>完成這輪複習</h2>
    <p>你練習了 {results.size} 個單字，共評分 {index} 次。</p>
    <div className="result-metrics"><span><strong>{results.size - weak.length}</strong>已記住</span><span><strong>{weak.length}</strong>還不熟悉</span></div>
    <div className="result-actions"><button className="button button-secondary" onClick={onExit}>回到練習設定</button>
      {weak.length > 0 && <button className="button button-primary" onClick={retry}><RotateCcw size={17} />重練不熟單字</button>}</div>
  </section>

  const word = current.word
  const primary = flipped ? (englishFirst ? word.meaning : word.word) : (englishFirst ? word.word : word.meaning)
  const inEnglish = flipped ? !englishFirst : englishFirst
  return <div className="study-round">
    <div className="round-toolbar"><button className="text-button" onClick={() => {
      if (index > 0) setQueue(previous => previous.slice(0, index))
      else onExit()
    }} disabled={busy}><ArrowLeft size={17} />{index > 0 ? '結束這輪' : '回到設定'}</button>
      <span>{current.replay ? '再練一次 · ' : ''}第 {index + 1} / {queue.length} 張</span></div>
    <div className="progress-track" role="progressbar" aria-label="單字卡進度" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}><span style={{ width: `${progress}%` }} /></div>
    <div className="flashcard-wrap">
      <button className={`flashcard ${flipped ? 'flashcard-back' : ''}`} type="button" ref={flipButton} aria-pressed={flipped} onClick={() => setFlipped(value => !value)} disabled={busy}>
        <span className="card-corner"><Layers size={20} /> 單字卡 {pdfList ? <span className="tag">PDF List {pdfList.number}</span> : <PriorityMark word={word} />}</span>
        <span className="card-face">
          <span className="card-side">{inEnglish ? '英文' : '中文'}</span>
          <strong className={inEnglish ? 'card-english' : 'card-meaning'} lang={inEnglish ? 'en' : 'zh-TW'}>{primary}</strong>
          {flipped && <>
            {!englishFirst && <span className="card-secondary">{word.meaning}</span>}
            {word.partOfSpeech && <span className="tag">{word.partOfSpeech}</span>}
            {word.example && <span className="card-example" lang="en">{word.example}</span>}
            {word.exampleTranslation && <span className="card-translation">{word.exampleTranslation}</span>}
          </>}
        </span>
        <span className="card-flip-hint"><RotateCcw size={15} />{flipped ? '翻回正面' : '點一下翻面'}</span>
      </button>
      {(englishFirst || flipped) && <div className="flashcard-speech"><SpeakButton text={word.word} key={current.logId} /></div>}
    </div>
    {flipped ? <section className="rating-panel" aria-label="記憶評分">
      <p>這個單字記得多清楚？</p>
      <div className="rating-buttons">
        <button className="rating rating-again" disabled={busy} onClick={() => void grade('again')}><RotateCcw size={19} />不會<small>今天再練一次</small></button>
        <button className="rating rating-hard" disabled={busy} onClick={() => void grade('hard')}><CircleHelp size={19} />模糊<small>明天再複習</small></button>
        <button className="rating rating-good" disabled={busy} onClick={() => void grade('good')}><Check size={20} />記住了<small>安排下次複習</small></button>
      </div>
    </section> : <p className="card-instruction">先在心裡作答，再翻面確認。</p>}
    {error && <ErrorNotice message={error} />}
  </div>
}

function FlashcardSetup({ onBegin, pdfList }: { onBegin: (round: { words: Word[]; direction: Direction }) => void; pdfList?: PdfList }) {
  const data = useLearningData()
  const today = useToday()
  const { tiers, selection, selectedWords, setSelection } = usePrioritySelection(pdfList ? undefined : data?.words)
  const words = useMemo(() => pdfList && data ? pdfPracticeWords(pdfPracticeInputs(pdfList), data.words, today) : selectedWords, [pdfList, data, today, selectedWords])
  const learnedIds = useMemo(() => learnedWordIds(data?.reviewLogs ?? []), [data?.reviewLogs])
  const [scope, setScope] = useState<PracticeScope>(pdfList ? 'all' : 'today')
  const [direction, setDirection] = useState<Direction>('en-zh')
  const [count, setCount] = useState(pdfList ? 0 : 20)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = useMemo(() => pdfList && scope === 'all' ? words : orderPracticeWords(words, learnedIds, today, scope), [pdfList, words, learnedIds, today, scope])
  const progress = priorityProgress(words, learnedIds, today)
  const dueOutside = pdfList || selection.tier === null ? 0 : priorityProgress(data?.words ?? [], learnedIds, today).due - progress.due

  async function start() {
    if (busy || !available.length) return
    setBusy(true)
    setError('')
    try {
      const selected = count ? available.slice(0, count) : available
      onBegin({ words: pdfList ? await savePdfPracticeWords(selected) : selected, direction })
    } catch (failure) {
      setError(errorMessage(failure, '無法開始背單字，請再試一次。'))
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Loading />
  if (!pdfList && !data.words.length) return <EmptyState title="還沒有可以練習的單字" description="先新增幾個單字，或從專案 TOEIC 詞庫匯入。" action={<AddWordsLink />} />
  return <section className="panel setup-panel">
        <div className="panel-heading"><span className="tile-icon"><Brain size={21} /></span><div><h2>開始一輪單字卡</h2><p>{pdfList ? `這組共有 ${words.length} 個單字與片語。` : '先複習已到期的單字，再背來源星級較高的新字。'}</p></div></div>
        {!pdfList && <PriorityPicker tiers={tiers} selection={selection} onChange={setSelection} />}
        <p className="priority-scope-summary">所選範圍 · 到期 {progress.due.toLocaleString('zh-TW')} 個 · 新單字 {progress.fresh.toLocaleString('zh-TW')} 個</p>
        {dueOutside > 0 && <div className="notice notice-info priority-outside">
          <p>這個範圍以外還有 {dueOutside.toLocaleString('zh-TW')} 個到期單字。</p>
          <button className="text-button" type="button" onClick={() => { setSelection(allPriority); setScope('due') }}>複習全部到期</button>
        </div>}
        <div className="setup-fields">
          <fieldset><legend>單字範圍</legend><div className="segments">
            <label><input type="radio" name="scope" checked={scope === 'today'} onChange={() => setScope('today')} /><span>今日練習</span></label>
            <label><input type="radio" name="scope" checked={scope === 'due'} onChange={() => setScope('due')} /><span>只複習到期</span></label>
            <label><input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /><span>全部單字</span></label>
          </div></fieldset>
          <fieldset><legend>卡片方向</legend><div className="segments">
            <label><input type="radio" name="direction" checked={direction === 'en-zh'} onChange={() => setDirection('en-zh')} /><span>英翻中</span></label>
            <label><input type="radio" name="direction" checked={direction === 'zh-en'} onChange={() => setDirection('zh-en')} /><span>中翻英</span></label>
          </div></fieldset>
          <label className="field">本輪張數<select value={count} onChange={event => setCount(Number(event.target.value))}>
            {pdfList && <option value={0}>這組全部單字</option>}
            <option value={10}>最多 10 張</option><option value={20}>最多 20 張</option><option value={50}>最多 50 張</option>
          </select></label>
        </div>
        {available.length === 0 && <p className="notice notice-info">{words.length
          ? (pdfList ? '這組目前沒有到期單字，可切換練習範圍。' : '這個範圍目前沒有符合的單字，可切換練習範圍或選擇其他組別。')
          : '這個星級或分組沒有單字，可選擇其他組別。'}</p>}
        {error && <ErrorNotice message={error} />}
        <button className="button button-primary" disabled={!available.length || busy} onClick={() => void start()}>{busy ? '準備中…' : '開始背單字'}<ArrowRight size={17} /></button>
  </section>
}

function FlashcardPage({ pdfList, missingList }: { pdfList?: PdfList; missingList: boolean }) {
  const [round, setRound] = useState<{ words: Word[]; direction: Direction } | null>(null)
  return <div className="page practice-page">
    <PageHeading label="間隔複習" title={pdfList ? `PDF List ${pdfList.number} 單字卡` : '單字卡'}
      description={pdfList ? `${pdfList.chapter} · 原書第 ${pdfList.printedPage} 頁` : '先回想，再翻面確認。依記憶程度安排下次複習。'}
      action={pdfList && <PdfPracticeLink list={pdfList} />} />
    {missingList ? <MissingPdfList /> : round
      ? <StudyRound initial={round.words} direction={round.direction} onExit={() => setRound(null)} pdfList={pdfList} />
      : <FlashcardSetup onBegin={setRound} pdfList={pdfList} />}
  </div>
}

export function Flashcards() {
  const [params] = useSearchParams()
  const number = params.get('pdfList')
  const pdfList = findPdfList(number)
  return <FlashcardPage key={number} pdfList={pdfList} missingList={number !== null && !pdfList} />
}
