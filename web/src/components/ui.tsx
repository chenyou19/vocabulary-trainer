import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AlertCircle, BookOpen, LoaderCircle, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PageHeading({ label, title, description, action }: {
  label: string; title: string; description: string; action?: ReactNode
}) {
  return <header className="page-heading">
    <div><p className="eyebrow">{label}</p><h1>{title}</h1><p className="heading-description">{description}</p></div>
    {action && <div className="heading-action">{action}</div>}
  </header>
}

export function Loading({ text = '正在讀取學習資料…' }: { text?: string }) {
  return <div className="state-card" role="status"><LoaderCircle className="animate-spin" size={25} /><p>{text}</p></div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="state-card empty-state">
    <span className="state-icon"><BookOpen size={26} /></span>
    <h2>{title}</h2><p>{description}</p>{action}
  </div>
}

export function ErrorNotice({ message }: { message: string }) {
  return <p className="notice notice-error" role="alert"><AlertCircle size={17} />{message}</p>
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.name === 'Error' ? error.message : fallback
}

export function AddWordsLink() {
  return <Link className="button button-primary" to="/vocabulary">前往單字庫</Link>
}

export function Modal({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={event => {
    event.preventDefault()
    if (!busy) onClose()
  }} onClick={event => {
    if (event.target === event.currentTarget && !busy) onClose()
  }}>
    <div className="modal-content">
      <div className="modal-header"><h2 id="modal-title">{title}</h2>
        <button className="icon-button" type="button" aria-label="關閉對話框" onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>
}

export function Confirm({ title, children, action, onClose, onConfirm, requireText }: {
  title: string; children: ReactNode; action: string; onClose: () => void; onConfirm: () => Promise<void>; requireText?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || (requireText && text !== requireText)) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (failure) {
      setError(errorMessage(failure, '操作失敗，請再試一次。'))
      setBusy(false)
    }
  }
  return <Modal title={title} onClose={onClose} busy={busy}>
    <form className="form-stack" onSubmit={submit}>
      {children}
      {requireText && <label className="field">輸入「{requireText}」確認<input value={text} onChange={event => setText(event.target.value)} disabled={busy} /></label>}
      {error && <ErrorNotice message={error} />}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>取消</button>
        <button className="button button-danger" type="submit" disabled={busy || Boolean(requireText && text !== requireText)}>{busy ? '處理中…' : action}</button>
      </div>
    </form>
  </Modal>
}

export function SpeakButton({ text }: { text: string }) {
  const [message, setMessage] = useState('')
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  useEffect(() => () => {
    if (utterance.current && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  function speak() {
    if (!supported) return
    try {
      const synth = window.speechSynthesis
      const voices = synth.getVoices().filter(voice => voice.localService && /^en(?:-|$)/i.test(voice.lang))
      const voice = voices.find(item => item.lang.toLowerCase() === 'en-us') ?? voices[0]
      if (!voice) {
        setMessage('目前找不到本機英文語音。請確認裝置已安裝英文語音後再試。')
        return
      }
      setMessage('')
      synth.cancel()
      const next = new SpeechSynthesisUtterance(text)
      next.voice = voice
      next.lang = voice.lang
      next.rate = 0.85
      next.onerror = event => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') setMessage('無法播放發音，請檢查裝置的語音設定。')
      }
      utterance.current = next
      synth.speak(next)
    } catch {
      setMessage('無法播放發音，請檢查裝置的語音設定。')
    }
  }
  return <div className="speech">
    <button className="icon-button speech-button" type="button" aria-label="播放英文發音" title="播放英文發音" onClick={speak} disabled={!supported}><Volume2 size={22} /></button>
    {(!supported || message) && <p className="speech-note" role="status">{message || '這個瀏覽器不支援英文發音。'}</p>}
  </div>
}

export function downloadFile(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
