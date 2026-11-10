import { BarChart3, Target } from 'lucide-react'
import { formatAccuracy, summarize } from '../domain/stats'

type Week = ReturnType<typeof summarize>['week']

export function WeekChart({ week, metric = 'learned' }: { week: Week; metric?: 'learned' | 'accuracy' }) {
  const max = metric === 'accuracy' ? 100 : Math.max(4, ...week.map(day => day.learned))
  const title = metric === 'learned' ? '每日學習量' : '每日測驗正確率'
  return <figure className="week-chart" aria-label={title}>
    <div className="chart-grid">
      {week.map((day, index) => {
        const value = day[metric]
        const display = metric === 'accuracy' ? formatAccuracy(value) : String(value)
        const date = `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8))}`
        return <div className={`chart-column ${index === 6 ? 'chart-today' : ''}`} key={day.date}
          aria-label={`${day.date}，${title} ${display}`}>
          <div className="chart-track">
            <div className="chart-stack" style={{ height: `calc(${(value ?? 0) / max * 100}% + 1.65rem)` }}>
              <span className="chart-value">{display}</span><span className="chart-bar" />
            </div>
          </div>
          <span className="chart-date">{date}</span>
        </div>
      })}
    </div>
  </figure>
}

export function ChartPanel({ week, metric = 'learned', compact = false }: {
  week: Week; metric?: 'learned' | 'accuracy'; compact?: boolean
}) {
  return <section className={`panel chart-panel ${compact ? 'compact-chart' : ''}`}>
    <div className="panel-heading">
      <span className="tile-icon"><BarChart3 size={19} /></span>
      <div><h2>{compact ? '近七天學習' : metric === 'learned' ? '近七天學習量' : '近七天測驗正確率'}</h2>
        <p>{metric === 'learned' ? '每日練習過的不同單字' : '依實際作答題數計算'}</p></div>
    </div>
    <WeekChart week={week} metric={metric} />
    {week.every(day => metric === 'learned' ? day.learned === 0 : day.answers === 0) && <p className="chart-empty">最近七天尚無{metric === 'learned' ? '練習' : '測驗'}紀錄</p>}
  </section>
}

export function GoalPanel({ count, goal }: { count: number; goal: number }) {
  const progress = Math.min(100, Math.round(count * 100 / goal))
  return <section className="panel goal-panel">
    <div className="panel-heading"><span className="tile-icon"><Target size={19} /></span>
      <div><h2>每日學習目標</h2><p>完成今天的單字練習</p></div></div>
    <div className="goal-ring" style={{ background: `conic-gradient(var(--accent) ${progress}%, var(--track) 0)` }}
      role="progressbar" aria-label="每日學習目標" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(count, goal)}>
      <div><strong>{count}<span> / {goal}</span></strong><small>個單字</small></div>
    </div>
    <p className="goal-caption">{count >= goal ? '今日目標已達成' : `再練習 ${goal - count} 個單字即可達標`}</p>
  </section>
}
