import { useState } from 'react'
import type { FormEvent } from 'react'
import { Database, Download, Moon, ShieldCheck, Sun, Target, Trash2, Upload } from 'lucide-react'
import { Confirm, ErrorNotice, Loading, PageHeading, downloadFile, errorMessage } from '../components/ui'
import { useSettings } from '../data/hooks'
import { repository } from '../data/repository'
import { parseBackup } from '../domain/backup'
import type { Backup } from '../domain/backup'
import { localDate } from '../domain/dates'
import type { Settings } from '../domain/model'

function GoalForm({ goal, onSave, disabled }: { goal: number; onSave: (value: number) => Promise<void>; disabled: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSave(Number(data.get('dailyGoal')))
  }
  return <form className="goal-form" onSubmit={submit}>
    <label className="field">每日單字數<input type="number" name="dailyGoal" defaultValue={goal} min={1} max={999} required /></label>
    <button className="button button-primary" type="submit" disabled={disabled}>儲存目標</button>
  </form>
}

export function SettingsPage() {
  const settings = useSettings()
  const [busy, setBusy] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [pending, setPending] = useState<Backup | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function action(task: () => Promise<void>, failure: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try { await task() }
    catch (caught) { setError(errorMessage(caught, failure)) }
    finally { setBusy(false) }
  }

  async function save(update: Partial<Settings>, success: string) {
    await action(async () => {
      await repository.saveSettings(update)
      setMessage(success)
    }, '無法儲存設定，請再試一次。')
  }

  if (!settings) return <Loading />
  return <div className="page settings-page">
    <PageHeading label="偏好與資料" title="設定與備份" description="調整每日學習目標和介面，定期備份這個瀏覽器的學習資料。" />
    {message && <p className="notice notice-success" role="status">{message}</p>}
    {error && <ErrorNotice message={error} />}
    <section className="panel settings-panel">
      <div className="panel-heading"><span className="tile-icon"><Target size={19} /></span><div><h2>每日學習目標</h2><p>同一天重複練習同一個單字，會計為一個。</p></div></div>
      <GoalForm key={settings.dailyGoal} goal={settings.dailyGoal} disabled={busy} onSave={dailyGoal => save({ dailyGoal }, '每日學習目標已更新。')} />
    </section>
    <section className="panel settings-panel">
      <div className="panel-heading"><span className="tile-icon"><Sun size={19} /></span><div><h2>介面主題</h2><p>選擇在目前裝置上閱讀最舒服的主題。</p></div></div>
      <fieldset className="theme-field"><legend className="sr-only">介面主題</legend><div className="segments">
        {([{ id: 'light', label: '淺色', icon: Sun }, { id: 'dark', label: '深色', icon: Moon }] as const).map(({ id, label, icon: Icon }) =>
          <label key={id}><input type="radio" name="theme" checked={settings.theme === id} disabled={busy} onChange={() => void save({ theme: id }, '介面主題已更新。')} />
            <span><Icon size={17} />{label}</span></label>)}
      </div></fieldset>
    </section>
    <section className="panel settings-panel">
      <div className="panel-heading"><span className="tile-icon"><Database size={19} /></span><div><h2>資料備份</h2><p>完整備份包含單字、練習紀錄、測驗與設定。</p></div></div>
      <div className="backup-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void action(async () => {
          const backup = await repository.snapshot()
          downloadFile(`vocabulary-trainer-backup-${localDate()}.json`, JSON.stringify(backup, null, 2), 'application/json')
          setMessage('備份檔已開始下載。')
        }, '無法匯出備份，請再試一次。')}><Download size={17} />匯出完整備份</button>
        <label className={`button button-secondary file-button ${busy ? 'file-disabled' : ''}`}><Upload size={17} />選擇備份檔
          <input className="sr-only" type="file" accept=".json,application/json" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void action(async () => { setPending(parseBackup(await file.text())) }, '無法讀取備份檔，請確認檔案格式。')
          }} />
        </label>
      </div>
      <p className="local-note"><ShieldCheck size={17} />學習資料保存在這個瀏覽器，換裝置時可透過備份移轉。</p>
    </section>
    <section className="panel settings-panel danger-panel">
      <div className="panel-heading"><span className="tile-icon tone-amber"><Trash2 size={19} /></span><div><h2>清除全部資料</h2><p>移除這個瀏覽器中的單字、學習紀錄和設定。</p></div></div>
      <button type="button" className="button button-danger" onClick={() => setClearing(true)} disabled={busy}><Trash2 size={16} />清除全部資料</button>
    </section>
    {pending && <Confirm title="覆蓋目前的學習資料？" action="確認還原" onClose={() => setPending(null)} onConfirm={async () => {
      await repository.restore(pending)
      setMessage('已從備份還原學習資料。')
    }}><p>這份備份包含 {pending.words.length.toLocaleString('zh-TW')} 個單字、{pending.reviewLogs.length.toLocaleString('zh-TW')} 筆練習紀錄及 {pending.quizSessions.length.toLocaleString('zh-TW')} 次測驗。還原會覆蓋目前的全部資料及設定。</p></Confirm>}
    {clearing && <Confirm title="確定清除全部資料？" action="永久清除" requireText="清除" onClose={() => setClearing(false)} onConfirm={async () => {
      await repository.clear()
      setMessage('已清除全部學習資料。')
    }}><p>清除後只能用已下載的備份還原。</p></Confirm>}
  </div>
}
