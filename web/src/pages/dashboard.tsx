import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Layers, Sparkles, Star, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChartPanel, GoalPanel } from '../components/charts'
import { Loading } from '../components/ui'
import { useLearningData, useToday } from '../data/hooks'
import { prioritySearch, wordPriority } from '../domain/priority'
import { formatAccuracy, summarize } from '../domain/stats'

function Illustration() {
  return <svg className="hero-art" viewBox="0 0 390 290" fill="none" aria-hidden="true">
    <defs><pattern id="art-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#46694F" opacity=".28" /></pattern></defs>
    <circle cx="241" cy="147" r="107" fill="#DCE6CE" />
    <circle cx="241" cy="147" r="126" stroke="#789781" strokeDasharray="3 8" opacity=".65" />
    <path d="M104 212h61v63h-61zM298 16h55v55h-55z" fill="url(#art-dots)" />
    <g transform="rotate(14 254 140)"><rect x="171" y="55" width="155" height="191" rx="17" fill="#E9E9B7" stroke="#335740" strokeWidth="1.4" />
      <path d="M197 224h76" stroke="#7A9664" strokeWidth="1.3" strokeLinecap="round" /></g>
    <g transform="rotate(-12 207 146)"><rect x="131" y="52" width="156" height="188" rx="18" fill="#FAF9EF" stroke="#335740" strokeWidth="1.6" />
      <rect x="149" y="70" width="120" height="139" rx="11" fill="#EFF2E2" stroke="#A6B5A0" />
      <text x="209" y="148" textAnchor="middle" fontFamily="Georgia,serif" fontSize="67" fill="#244A38">Aa</text>
      <path d="M177 169h64M189 179h40M187 222h43" stroke="#8BA188" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="157" cy="222" r="3" fill="#6F8C6D" /><circle cx="260" cy="222" r="3" fill="#6F8C6D" /></g>
    <path d="M320 82c2 13 4 15 16 17-12 2-14 5-16 17-2-12-4-15-16-17 12-2 14-4 16-17ZM108 137c1 8 3 10 11 11-8 1-10 3-11 11-2-8-3-10-11-11 8-1 9-3 11-11Z" fill="#335740"/>
    <path d="M300 218c16-5 32-4 48 4m-44 5c9-2 18-1 26 3" stroke="#5D8064" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="127" cy="51" r="4" stroke="#6D8B6B" /><circle cx="348" cy="163" r="5" stroke="#6D8B6B" />
  </svg>
}

export function Dashboard() {
  const data = useLearningData()
  const today = useToday()
  if (!data) return <Loading />
  const stats = summarize(data.words, data.reviewLogs)
  const hasFiveStars = data.words.some(word => wordPriority(word) === 5)
  const displayDate = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' }).format(new Date(`${today}T12:00:00`))
  const metrics = [
    { label: '單字庫總數', value: stats.total.toLocaleString('zh-TW'), unit: '個', icon: BookOpen, tone: 'green' },
    { label: '今日待複習', value: stats.due.toLocaleString('zh-TW'), unit: '個', icon: Clock3, tone: 'amber' },
    { label: '尚未學習', value: stats.fresh.toLocaleString('zh-TW'), unit: '個', icon: Star, tone: 'amber' },
    { label: '今日已學習', value: stats.todayLearned.toLocaleString('zh-TW'), unit: '個', icon: CheckCircle2, tone: 'green' },
    { label: '今日測驗正確率', value: formatAccuracy(stats.todayAccuracy), unit: '', icon: Target, tone: 'violet' },
  ]
  return <div className="page dashboard">
    <header className="dashboard-header">
      <div><p className="eyebrow">我的學習工作區</p><h1>學習首頁</h1></div>
      <p className="date-pill"><CalendarDays size={16} />{displayDate}</p>
    </header>
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-kicker"><Sparkles size={15} /> 每日單字練習</span>
        <h2>今天想練哪些單字？</h2>
        <p>用單字卡複習，或做一輪測驗看看自己記住了多少。</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/flashcards"><Layers size={17} />開始背單字</Link>
          <Link className="button button-hero" to="/quiz">開始測驗<ArrowRight size={17} /></Link>
        </div>
        {hasFiveStars && <Link className="hero-priority-link" to={`/flashcards${prioritySearch({ tier: 5, batch: null })}`}>
          <Star size={16} />從 5 星單字開始<ArrowRight size={15} />
        </Link>}
      </div>
      <Illustration />
    </section>
    <section className="metrics-grid" aria-label="今日學習摘要">
      {metrics.map(({ label, value, unit, icon: Icon, tone }) => <article className="panel metric" key={label}>
        <span className={`tile-icon tone-${tone}`}><Icon size={19} /></span>
        <p>{label}</p><div><strong>{value}</strong>{unit && <small>{unit}</small>}</div>
      </article>)}
    </section>
    {stats.total === 0 && <div className="dashboard-empty"><span><BookOpen size={18} />單字庫目前是空的。</span>
      <Link to="/vocabulary">新增或匯入單字<ArrowRight size={16} /></Link>
    </div>}
    <div className="overview-grid"><GoalPanel count={stats.todayLearned} goal={data.settings.dailyGoal} /><ChartPanel week={stats.week} compact /></div>
  </div>
}
