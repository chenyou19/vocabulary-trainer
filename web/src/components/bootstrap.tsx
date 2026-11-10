import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ErrorNotice, Loading } from './ui'
import { loadInitialVocabulary } from '../data/project-vocabulary'
import { repository } from '../data/repository'

export function VocabularyBootstrap({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    void repository.initializeProjectVocabulary(loadInitialVocabulary).then(
      () => { if (active) setStatus('ready') },
      () => { if (active) setStatus('error') },
    )
    return () => { active = false }
  }, [attempt])

  if (status === 'ready') return children
  return <main className="fatal-card">
    <h1>Vocabulary Trainer</h1>
    {status === 'loading' ? <Loading text="正在準備單字庫。首次開啟時，會自動下載並儲存專案 TOEIC 詞庫。" />
      : <>
        <ErrorNotice message="無法準備單字庫。請確認網路連線，以及瀏覽器允許本機儲存且有足夠空間，再重試。" />
        <button className="button button-primary" type="button" onClick={() => {
          setStatus('loading')
          setAttempt(previous => previous + 1)
        }}>重試</button>
      </>}
  </main>
}
