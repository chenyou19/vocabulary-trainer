import { Activity, BookOpen, ChartNoAxesColumnIncreasing, CircleCheck, Target, TrendingUp } from 'lucide-react'
import { ChartPanel } from '../components/charts'
import { EmptyState, Loading, PageHeading } from '../components/ui'
import { useLearningData, useToday } from '../data/hooks'
import { formatAccuracy, summarize } from '../domain/stats'

export function Statistics() {
  const data = useLearningData()
  const today = useToday()
  if (!data) return <Loading />
  const stats = summarize(data.words, data.reviewLogs, new Date(`${today}T12:00:00`))
  const metrics = [
    { label: '單字總數', value: stats.total, icon: BookOpen, tone: 'green' },
    { label: '已學習單字', value: stats.learned, icon: CircleCheck, tone: 'green' },
    { label: '累計練習次數', value: stats.attempts, icon: Activity, tone: 'amber' },
    { label: '累計測驗正確率', value: formatAccuracy(stats.quizAccuracy), icon: Target, tone: 'violet' },
  ]

  return <div className="page statistics">
    <PageHeading label="掌握進度" title="學習統計" description="查看單字熟練度、近七天的練習和最常答錯的單字。" />
    <section className="metrics-grid" aria-label="累計學習摘要">
      {metrics.map(({ label, value, icon: Icon, tone }) => <article className="panel metric" key={label}>
        <span className={`tile-icon tone-${tone}`}><Icon size={19} /></span><p>{label}</p>
        <div><strong>{typeof value === 'number' ? value.toLocaleString('zh-TW') : value}</strong></div>
      </article>)}
    </section>
    <section className="panel stages-panel">
      <div className="panel-heading"><span className="tile-icon"><TrendingUp size={19} /></span><div><h2>單字熟練度</h2><p>依間隔複習階段分組</p></div></div>
      {stats.total === 0 ? <p className="chart-empty">單字庫還沒有資料</p> : <div className="stages-chart">
        {stats.stages.map((stage, index) => <div className="stage-chart-row" key={stage.label}>
          <span className={`stage stage-${index}`}>{stage.label}</span>
          <span className="stage-track" aria-hidden="true"><span style={{ width: `${stage.count / stats.total * 100}%` }} /></span>
          <strong>{stage.count.toLocaleString('zh-TW')}</strong>
        </div>)}
      </div>}
    </section>
    <div className="statistics-charts"><ChartPanel week={stats.week} /><ChartPanel week={stats.week} metric="accuracy" /></div>
    <section className="panel mistake-panel">
      <div className="panel-heading"><span className="tile-icon"><ChartNoAxesColumnIncreasing size={19} /></span><div><h2>最常答錯的單字</h2><p>計入單字卡評為「不會」和測驗答錯的紀錄</p></div></div>
      {stats.mistakes.length ? <ol className="mistake-list">{stats.mistakes.map((item, index) => <li key={`${item.word}-${index}`}>
        <span className="mistake-rank">{index + 1}</span><div><strong lang="en">{item.word}</strong><span>{item.meaning}</span></div>
        <span className="tag">答錯 {item.count} 次</span>
      </li>)}</ol> : <EmptyState title="目前沒有錯題" description="開始複習或測驗後，答錯的單字會列在這裡。" />}
    </section>
  </div>
}
