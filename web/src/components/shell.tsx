import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, ChartNoAxesColumnIncreasing, Database, House, Layers, Library, ListChecks, Settings2 } from 'lucide-react'
import { useSettings } from '../data/hooks'

const items = [
  { to: '/', label: '學習首頁', short: '首頁', icon: House },
  { to: '/vocabulary', label: '單字庫', short: '單字', icon: Library },
  { to: '/flashcards', label: '單字卡', short: '卡片', icon: Layers },
  { to: '/quiz', label: '單字測驗', short: '測驗', icon: ListChecks },
  { to: '/statistics', label: '學習統計', short: '統計', icon: ChartNoAxesColumnIncreasing },
  { to: '/settings', label: '設定與備份', short: '設定', icon: Settings2 },
]

export function Shell() {
  const settings = useSettings()
  const { pathname } = useLocation()
  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.theme = settings.theme
    try { localStorage.setItem('vocabulary-trainer-theme', settings.theme) } catch { /* IndexedDB remains authoritative. */ }
  }, [settings])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault()
      document.getElementById('main-content')?.focus()
    }}>跳至主要內容</a>
    <aside className="sidebar">
      <NavLink to="/" className="brand" aria-label="Vocabulary Trainer 首頁">
        <span className="brand-icon"><BookOpen size={22} /></span>
        <span>Vocabulary<span className="brand-secondary">Trainer</span></span>
      </NavLink>
      <p className="sidebar-label">學習工作區</p>
      <nav className="navigation" aria-label="主要導覽">
        {items.map(({ to, label, short, icon: Icon }) => <NavLink to={to} end={to === '/'} key={to} aria-label={label}>
          <Icon size={19} aria-hidden="true" /><span className="desktop-label">{label}</span><span className="mobile-label">{short}</span>
        </NavLink>)}
      </nav>
      <div className="sidebar-footer"><Database size={16} /><span>學習資料儲存在此瀏覽器</span></div>
    </aside>
    <main className="main-content" id="main-content" tabIndex={-1}><Outlet /></main>
  </div>
}
