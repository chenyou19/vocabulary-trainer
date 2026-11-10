import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDate } from '../domain/dates'
import { repository } from './repository'

export function useWords() {
  return useLiveQuery(() => repository.listWords(), [])
}

export function useSettings() {
  return useLiveQuery(() => repository.getSettings(), [])
}

export function useLearningData() {
  return useLiveQuery(() => repository.snapshot(), [])
}

export function useToday() {
  const [today, setToday] = useState(() => localDate())
  useEffect(() => {
    const refresh = () => setToday(localDate())
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return today
}
