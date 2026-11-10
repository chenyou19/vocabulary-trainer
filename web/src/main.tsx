import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { VocabularyBootstrap } from './components/bootstrap'
import { Shell } from './components/shell'
import { ErrorNotice } from './components/ui'
import { Dashboard } from './pages/dashboard'
import { Vocabulary } from './pages/vocabulary'
import { Flashcards } from './pages/flashcards'
import { Quiz } from './pages/quiz'
import { Statistics } from './pages/statistics'
import { SettingsPage } from './pages/settings'
import './styles.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-card">
      <h1>暫時無法載入</h1>
      <ErrorNotice message="無法開啟學習資料。請確認瀏覽器允許本站使用 IndexedDB，然後重新載入。" />
      <button className="button button-primary" onClick={() => window.location.reload()}>重新載入</button>
    </main>
  }
}

try {
  document.documentElement.dataset.theme = localStorage.getItem('vocabulary-trainer-theme') === 'dark' ? 'dark' : 'light'
} catch { /* The page can still load when storage is unavailable. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary><VocabularyBootstrap><HashRouter><Routes>
    <Route element={<Shell />}>
      <Route index element={<Dashboard />} />
      <Route path="vocabulary" element={<Vocabulary />} />
      <Route path="flashcards" element={<Flashcards />} />
      <Route path="quiz" element={<Quiz />} />
      <Route path="statistics" element={<Statistics />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></HashRouter></VocabularyBootstrap></ErrorBoundary></StrictMode>,
)
