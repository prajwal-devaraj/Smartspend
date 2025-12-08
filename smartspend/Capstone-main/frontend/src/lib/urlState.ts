import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export type UrlFilters = {
  date?: string // '2025-10-01..2025-10-31' or '7d' etc
  type?: 'expense' | 'income'
  merchant?: string
  category?: string
  nwg?: 'need' | 'want' | 'guilt'
  mood?: 'stressed' | 'neutral' | 'happy' | 'impulse'
  latenight?: 'true'
  min?: string
  max?: string
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  q?: string
  flag?: 'mood'
}

const parse = (search: string): UrlFilters => {
  const sp = new URLSearchParams(search)
  const obj: UrlFilters = {}
  sp.forEach((v,k) => { (obj as any)[k] = v })
  return obj
}

export function useUrlState<T extends object>(initial: T) {
  const loc = useLocation()
  const nav = useNavigate()
  const parsed = useMemo(()=>parse(loc.search), [loc.search])
  const [state, setState] = useState<T>({...initial, ...parsed} as T)

  useEffect(() => { setState(s => ({...s, ...parsed})) }, [parsed])

  const set = (next: Partial<T>) => {
    const sp = new URLSearchParams(loc.search)
    Object.entries(next).forEach(([k,v])=>{
      if (v === undefined || v === '' || v === null) sp.delete(k)
      else sp.set(k, String(v))
    })
    nav({ pathname: loc.pathname, search: sp.toString() }, { replace: true })
  }

  const clearKeys = (keys: (keyof T)[]) => {
    const sp = new URLSearchParams(loc.search)
    keys.forEach(k => sp.delete(String(k)))
    nav({ pathname: loc.pathname, search: sp.toString() }, { replace: true })
  }

  return { state, set, clearKeys }
}
