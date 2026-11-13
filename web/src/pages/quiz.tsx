import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, Keyboard, ListChecks, RotateCcw, Trophy, XCircle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { MissingPdfList, PdfPracticeLink } from '../components/pdf-practice'
import { PriorityPicker, usePrioritySelection } from '../components/priority-picker'
import { AddWordsLink, EmptyState, ErrorNotice, Loading, PageHeading, errorMessage } from '../components/ui'
import { useLearningData, useToday } from '../data/hooks'
import { pdfPracticeInputs, pdfPracticeWords, savePdfPracticeWords } from '../data/pdf-practice'
import { findPdfList } from '../data/pdf-vocabulary'
import type { PdfList } from '../data/pdf-vocabulary'
import { repository } from '../data/repository'
import { quizLabels } from '../domain/model'
import type { QuizQuestion, QuizSession, QuizType, Word } from '../domain/model'
import { buildQuiz, matchesSpelling } from '../domain/quiz'

const modes = [
  { id: 'en-zh', title: '英翻中', description: '看英文，選中文意思', icon: ListChecks },
  { id: 'zh-en', title: '中翻英', description: '看中文，選英文單字', icon: CircleHelp },
  { id: 'spelling', title: '拼字測驗', description: '看中文，寫出完整拼字', icon: Keyboard },
] as const

interface Round {
  session: QuizSession
  questions: QuizQuestion[]
  notice: string
  pdfWords?: Word[]
}

interface Answer { entered: string; correct: boolean }

async function prepareRound(words: Word[], quizType: QuizType, size: number, allowSpelling = false, pdf = false): Promise<Round> {
  let questions = buildQuiz(words, words, quizType, size)
  let notice = ''
  if (!questions.length && allowSpelling && quizType !== 'spelling') {
    quizType = 'spelling'
    questions = buildQuiz(words, words, quizType, size)
    notice = '錯題不足以組成四個不同選項，已改用拼字測驗。'
  }
  if (!questions.length) throw new Error('目前的範圍沒有適合的題目，請調整分類或測驗模式。')
  if (questions.length < size && !notice) notice = `此範圍可出 ${questions.length} 題，本次先練習這些題目。`
  let pdfWords: Word[] | undefined
  if (pdf) {
    const byId = new Map(words.map(word => [word.id, word]))
    const stored = await savePdfPracticeWords(questions.map(question => byId.get(question.wordId)!))
    pdfWords = stored
    questions = questions.map((question, index) => ({ ...question, wordId: stored[index].id }))
  }
  const session = await repository.startQuiz(quizType, questions.length)
  return { questions, session, notice, pdfWords }
}

function QuizRound({ round, onExit, onRetry }: {
  round: Round; onExit: () => void; onRetry: (ids: string[], type: QuizType) => Promise<void>
}) {
  const [answers, setAnswers] = useState<Answer[]>([])
  const [index, setIndex] = useState(0)
  const [entered, setEntered] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const prompt = useRef<HTMLHeadingElement>(null)
  const spellingInput = useRef<HTMLInputElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const current: QuizQuestion | undefined = round.questions[index]
  const result: Answer | undefined = answers[index]
  const spelling = round.session.quizType === 'spelling'

  useEffect(() => {
    if (result) nextButton.current?.focus({ preventScroll: true })
    else (spellingInput.current ?? prompt.current)?.focus({ preventScroll: true })
  }, [index, result])

  async function submit(value: string) {
    if (!current || result || lock.current || !value.trim()) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const correct = spelling ? matchesSpelling(value, current.answer) : value === current.answer
      const stored = await repository.recordAnswer(round.session.id, index, current, correct)
      setAnswers(previous => [...previous, { entered: value, correct: stored }])
    } catch (failure) {
      setError(errorMessage(failure, '無法儲存作答，請再試一次。'))
    } finally {
      setBusy(false)
      lock.current = false
    }
  }

  async function retry(ids: string[]) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await onRetry(ids, round.session.quizType)
    } catch (failure) {
      setError(errorMessage(failure, '目前無法開始錯題練習。'))
      setBusy(false)
      lock.current = false
    }
  }

  if (!current) {
    const correct = answers.filter(answer => answer.correct).length
    const wrong = round.questions.filter((_, i) => !answers[i]?.correct)
    return <section className="panel result-panel">
      <span className="result-icon"><Trophy size={34} /></span>
      <h2 tabIndex={-1} ref={prompt}>測驗完成</h2>
      <p>{quizLabels[round.session.quizType]} · 共 {answers.length} 題</p>
      <div className="result-metrics"><span><strong>{Math.round(correct / answers.length * 100)}%</strong>正確率</span>
        <span><strong>{correct}</strong>答對</span><span><strong>{wrong.length}</strong>答錯</span></div>
      {wrong.length > 0 && <div className="result-wrong">
        <h3>這次的錯題</h3>{wrong.map(question => <div key={question.wordId}><strong lang="en">{question.word}</strong><span>{question.meaning}</span></div>)}
      </div>}
      <div className="result-actions"><button className="button button-secondary" onClick={onExit} disabled={busy}>回到測驗設定</button>
        {wrong.length > 0 && <button className="button button-primary" onClick={() => void retry(wrong.map(question => question.wordId))} disabled={busy}>
          <RotateCcw size={17} />{busy ? '準備中…' : '重新練習錯題'}</button>}</div>
      {error && <ErrorNotice message={error} />}
    </section>
  }

  const progress = Math.round(answers.length * 100 / round.questions.length)
  const promptInEnglish = round.session.quizType === 'en-zh'
  return <div className="quiz-round">
    <div className="round-toolbar"><button className="text-button" onClick={onExit} disabled={busy}><ArrowLeft size={17} />回到測驗設定</button>
      <span>第 {index + 1} / {round.questions.length} 題</span></div>
    <div className="progress-track" role="progressbar" aria-label="測驗進度" aria-valuemin={0} aria-valuemax={round.questions.length} aria-valuenow={answers.length}><span style={{ width: `${progress}%` }} /></div>
    {round.notice && <p className="notice notice-info">{round.notice}</p>}
    <section className="panel question-panel">
      <div className="question-top"><span className="tag">{quizLabels[round.session.quizType]}</span><span className="muted text-xs">AI_original</span></div>
      <p className="question-hint">{spelling ? '請輸入完整英文單字' : promptInEnglish ? '選擇最符合的中文意思' : '選擇最符合的英文單字'}</p>
      <h2 ref={prompt} tabIndex={-1} className={promptInEnglish ? 'question-english' : ''} lang={promptInEnglish ? 'en' : 'zh-TW'}>{current.prompt}</h2>
      {spelling ? <form className="spelling-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(entered) }}>
        <label className="sr-only" htmlFor="spelling-answer">英文拼字答案</label>
        <input id="spelling-answer" lang="en" ref={spellingInput} value={entered} onChange={event => setEntered(event.target.value)} placeholder="輸入英文答案" autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy || Boolean(result)} />
        {!result && <button className="button button-primary" type="submit" disabled={busy || !entered.trim()}>送出答案</button>}
      </form> : <div className="quiz-options">
        {current.options.map((option, optionIndex) => {
          const correct = result && option === current.answer
          const wrong = result && !result.correct && option === result.entered
          return <button className={`quiz-option ${correct ? 'option-correct' : wrong ? 'option-wrong' : ''}`} type="button"
            key={option} disabled={busy || Boolean(result)} onClick={() => void submit(option)}>
            <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
            <span lang={promptInEnglish ? 'zh-TW' : 'en'}>{option}</span>
            {correct && <CheckCircle2 size={19} />}{wrong && <XCircle size={19} />}
          </button>
        })}
      </div>}
      {result && <div className={`answer-feedback ${result.correct ? 'feedback-correct' : 'feedback-wrong'}`} role="status">
        {result.correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
        <div><strong>{result.correct ? '答對了' : '這題答錯了'}</strong><p>正確答案 <span lang={promptInEnglish ? 'zh-TW' : 'en'}>{current.answer}</span></p>
          {spelling && !result.correct && <p>你的拼字 <span lang="en">{result.entered}</span></p>}</div>
      </div>}
      {result && Boolean(current.optionExplanations?.length) && <div className="option-explanations">
        <h3>選項對照</h3>
        <ul>{current.optionExplanations?.map((option, optionIndex) => <li key={option.option}>
          <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span>
          <span><strong lang="en">{option.word}</strong> · {option.meaning}{option.option === current.answer && <span className="tag">正解</span>}</span>
        </li>)}</ul>
      </div>}
      {error && <ErrorNotice message={error} />}
      {result && <div className="quiz-next"><button className="button button-primary" ref={nextButton} onClick={() => {
        setEntered('')
        setIndex(value => value + 1)
      }}>{index + 1 === round.questions.length ? '查看結果' : '下一題'}<ArrowRight size={17} /></button></div>}
    </section>
  </div>
}

function QuizSetup({ onBegin, pdfList }: { onBegin: (round: Round) => void; pdfList?: PdfList }) {
  const data = useLearningData()
  const today = useToday()
  const { tiers, selection, selectedWords, setSelection } = usePrioritySelection(pdfList ? undefined : data?.words)
  const words = useMemo(() => pdfList && data ? pdfPracticeWords(pdfPracticeInputs(pdfList), data.words, today) : selectedWords, [pdfList, data, today, selectedWords])
  const [type, setType] = useState<QuizType>('en-zh')
  const [category, setCategory] = useState('')
  const [mistakes, setMistakes] = useState(false)
  const [count, setCount] = useState(pdfList ? 0 : 10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const categories = useMemo(() => pdfList ? [] : [...new Set(data?.words.flatMap(word => word.tags))].sort((a, b) => a.localeCompare(b, 'zh-TW')), [data, pdfList])
  const pool = useMemo(() => {
    const wrongIds = new Set(data?.reviewLogs.filter(log => log.mode === 'quiz' && log.isCorrect === false).map(log => log.wordId))
    return words.filter(word => (!category || word.tags.includes(category)) && (!mistakes || wrongIds.has(word.id)))
  }, [words, data?.reviewLogs, category, mistakes])
  const canStart = useMemo(() => Boolean(buildQuiz(pool, pool, type, 1).length), [pool, type])
  const canSwitchToSpelling = useMemo(() => !canStart && type !== 'spelling' && Boolean(buildQuiz(pool, pool, 'spelling', 1).length), [pool, type, canStart])

  async function start() {
    if (busy || !canStart) return
    setBusy(true)
    setError('')
    try { onBegin(await prepareRound(pool, type, count || pool.length, false, Boolean(pdfList))) }
    catch (failure) { setError(errorMessage(failure, '無法開始測驗，請再試一次。')) }
    finally { setBusy(false) }
  }

  if (!data) return <Loading />
  if (!pdfList && !data.words.length) return <EmptyState title="還沒有可以測驗的單字" description="先在單字庫新增或匯入單字，再回來做測驗。" action={<AddWordsLink />} />
  return <section className="panel setup-panel quiz-setup">
        <fieldset><legend>測驗模式</legend><div className="mode-grid">
          {modes.map(({ id, title, description, icon: Icon }) => <label className="mode-card" key={id}>
            <input type="radio" name="quiz-type" checked={type === id} onChange={() => setType(id)} />
            <span className="mode-content"><span className="tile-icon"><Icon size={21} /></span><strong>{title}</strong><small>{description}</small></span>
          </label>)}
        </div></fieldset>
        {!pdfList && <PriorityPicker tiers={tiers} selection={selection} onChange={setSelection} />}
        <div className="setup-fields">
          {!pdfList && <label className="field">單字分類<select value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">所有分類</option>{categories.map(tag => <option key={tag}>{tag}</option>)}
          </select></label>}
          <label className="field">測驗題數<select value={count} onChange={event => setCount(Number(event.target.value))}>
            {pdfList && <option value={0}>這組所有可出題詞條</option>}
            {[5, 10, 20, 30, 50].map(size => <option key={size} value={size}>{size} 題</option>)}
          </select></label>
          <fieldset><legend>出題範圍</legend><div className="segments">
            <label><input type="radio" name="quiz-scope" checked={!mistakes} onChange={() => setMistakes(false)} /><span>{pdfList ? '這組全部單字' : '符合條件的單字'}</span></label>
            <label><input type="radio" name="quiz-scope" checked={mistakes} onChange={() => setMistakes(true)} /><span>只測驗錯題</span></label>
          </div></fieldset>
        </div>
        <p className="priority-scope-summary">所選範圍有 {pool.length.toLocaleString('zh-TW')} 個單字</p>
        {!canStart && <p className="notice notice-info">{pool.length === 0 ? (pdfList ? '這組目前沒有符合條件的單字。' : '目前的範圍沒有單字，請調整星級、分組、分類或出題範圍。')
          : type === 'spelling' ? '這個範圍的中文提示對應多種拼字，請改選其他範圍或題型。'
          : canSwitchToSpelling ? '這個範圍無法組成四個不同選項，可以用拼字測驗。' : '這個範圍無法組成四個不同選項，請調整出題範圍。'}</p>}
        {error && <ErrorNotice message={error} />}
        <div className="priority-actions">
          <button className="button button-primary" type="button" disabled={!canStart || busy} onClick={() => void start()}>{busy ? '準備中…' : '開始測驗'}<ArrowRight size={17} /></button>
          {canSwitchToSpelling && <button className="button button-secondary" type="button" onClick={() => setType('spelling')}>改用拼字測驗</button>}
        </div>
  </section>
}

function QuizPage({ pdfList, missingList }: { pdfList?: PdfList; missingList: boolean }) {
  const [round, setRound] = useState<Round | null>(null)
  return <div className="page practice-page">
    <PageHeading label="測試記憶" title={pdfList ? `PDF List ${pdfList.number} 測驗` : '單字測驗'}
      description={pdfList ? `${pdfList.chapter} · 原書第 ${pdfList.printedPage} 頁` : '選擇題型與單字範圍，作答後就能看到正確答案。'}
      action={pdfList && <PdfPracticeLink list={pdfList} />} />
    {missingList ? <MissingPdfList /> : round ? <QuizRound key={round.session.id} round={round} onExit={() => setRound(null)} onRetry={async (ids, mode) => {
      const words = round.pdfWords ? round.pdfWords.filter(word => ids.includes(word.id)) : await repository.wordsById(ids)
      setRound(await prepareRound(words, mode, ids.length, true, Boolean(pdfList)))
    }} /> : <QuizSetup onBegin={setRound} pdfList={pdfList} />}
  </div>
}

export function Quiz() {
  const [params] = useSearchParams()
  const number = params.get('pdfList')
  const pdfList = findPdfList(number)
  return <QuizPage key={number} pdfList={pdfList} missingList={number !== null && !pdfList} />
}
