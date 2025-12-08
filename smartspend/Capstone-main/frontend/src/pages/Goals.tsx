// src/pages/GoalsPage.tsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import AdjustGoalModal from '@/components/goals/AdjustGoalModal'
import AchievementModal from '@/components/goals/AchievementModal'
import type { Achievement } from '@/lib/types'
import { get, patch } from '@/lib/api'
import { Sparkles, Trophy, Target, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { predictFromFeatures, type MlResponse } from '@/lib/ml'

type Snapshot = {
  goal_days: number
  days_left_regular: number
  days_left_power_save: number
  basis: {
    balance_cents: number
    avg_daily_burn_cents: number
    window_days: number
  }
}

type HistoryPoint = { d: string; regular: number; power: number }

// Shape the API item from /achievements/user
type UserAchievementRow = {
  user_achievement_id: number
  earned_at: string
  achievement_id: number
  code: string
  name: string
  description?: string
  icon?: string
}

// If your global Achievement type differs, this narrows what we actually use here
type UiAchievement = {
  id: number
  name: string
  earned_at: string
  description?: string
  icon?: string
  code?: string
}

const getUserId = () => Number(localStorage.getItem('userId') || 0)

export default function GoalsPage() {
  const [params, setParams] = useSearchParams()
  const urlRange = (params.get('range') as 'week' | 'month' | 'all' | null) ?? null
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>(urlRange ?? 'month')

  const [openAdjust, setOpenAdjust] = useState(false)

  // Server state
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [achievements, setAchievements] = useState<UiAchievement[]>([])
  const [activeAch, setActiveAch] = useState<UiAchievement | null>(null)

  const [loadingSnap, setLoadingSnap] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  const [errSnap, setErrSnap] = useState<string>('')
  const [errHist, setErrHist] = useState<string>('')

  // ML state
  const [ml, setMl] = useState<MlResponse | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlErr, setMlErr] = useState<string>('')

  // Keep range in URL (nice for back/refresh)
  useEffect(() => {
    const next = new URLSearchParams(params)
    next.set('range', timeRange)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange])

  // Loaders
  const loadSnapshot = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return
    setErrSnap(''); setLoadingSnap(true)
    try {
      const data = await get<Snapshot>('/goals/snapshot', { user_id })
      setSnapshot(data)
    } catch (e: any) {
      setErrSnap(e?.message || 'Failed to load goal snapshot')
      setSnapshot(null)
    } finally {
      setLoadingSnap(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return
    setErrHist(''); setLoadingHist(true)
    try {
      // Always ask 120 days; we slice client-side for week/month views
      const data = await get<{ points: HistoryPoint[] }>('/goals/history', { user_id, days: 120 })
      setHistory(Array.isArray(data?.points) ? data.points : [])
    } catch (e: any) {
      setErrHist(e?.message || 'Failed to load runway history')
      setHistory([])
    } finally {
      setLoadingHist(false)
    }
  }, [])

  const loadAchievements = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return
    try {
      // API returns { items: UserAchievementRow[] }
      const res = await get<{ items: UserAchievementRow[] }>('/achievements/user', { user_id })
      const items = Array.isArray(res?.items) ? res.items : []
      // Normalize to UI shape (note: API uses user_achievement_id)
      const normalized: UiAchievement[] = items.map(r => ({
        id: r.user_achievement_id,
        name: r.name,
        earned_at: r.earned_at,
        description: r.description,
        icon: r.icon,
        code: r.code,
      }))
      setAchievements(normalized)
    } catch {
      setAchievements([])
    }
  }, [])

  useEffect(() => { void loadSnapshot(); void loadHistory(); void loadAchievements() }, [loadSnapshot, loadHistory, loadAchievements])

  // Derived UI values
  const goal = snapshot?.goal_days ?? 30
  const currentRegular = snapshot?.days_left_regular ?? 0
  const powerSave = snapshot?.days_left_power_save ?? 0
  const psDelta = Math.max(0, powerSave - currentRegular)
  const pctToGoal = useMemo(() => {
    if (!goal) return 0
    return Math.max(0, Math.min(100, Math.round((currentRegular / goal) * 100)))
  }, [goal, currentRegular])

  // Time-range slicing for chart
  const displayedHistory = useMemo(() => {
    if (!history?.length) return []
    if (timeRange === 'week') return history.slice(-7)
    if (timeRange === 'month') return history.slice(-30)
    return history // 'all'
  }, [history, timeRange])

  const pill = (value: 'week' | 'month' | 'all', label: string) => (
    <button
      key={value}
      onClick={() => setTimeRange(value)}
      className={
        `rounded-xl border px-3 py-1.5 text-sm transition
         ${timeRange === value
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-soft bg-white hover:bg-cream'}`
      }
    >
      {label}
    </button>
  )

  // Adjust goal handler → backend PATCH then refresh snapshot
  const handleSaveGoal = async (n: number) => {
    const user_id = getUserId()
    if (!user_id) return
    const capped = Math.max(1, Math.min(30, n)) // monthly app → cap 30 days
    try {
      await patch('/goals/target', { user_id, target_days: capped })
      setOpenAdjust(false)
      await loadSnapshot()
    } catch {
      setOpenAdjust(false)
    }
  }

  // ---- ML: run prediction based on snapshot basis ----
  useEffect(() => {
    if (!snapshot) return

    const bal = (snapshot.basis.balance_cents || 0) / 100
    const burn = (snapshot.basis.avg_daily_burn_cents || 0) / 100
    const windowDays = snapshot.basis.window_days || 0

    // TODO: adjust the feature vector to match your training setup exactly.
    const features: number[] = [
      bal,
      burn,
      windowDays,
      goal,
      currentRegular,
      powerSave,
      psDelta,
      0,
      0,
      0,
      0,
    ]

    setMlLoading(true)
    setMlErr('')
    predictFromFeatures(features)
      .then(setMl)
      .catch(e => setMlErr(e.message || 'ML prediction failed'))
      .finally(() => setMlLoading(false))
  }, [snapshot, goal, currentRegular, powerSave, psDelta])

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-4">
        {/* Header + range pills */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Goals & Achievements</h1>
          <div className="flex items-center gap-2">
            {pill('week', 'Last 7 days')}
            {pill('month', 'Last 30 days')}
            {pill('all', 'All-time')}
          </div>
        </div>

        {/* Summary strip */}
        <div className="mb-4 rounded-2xl border border-soft bg-white p-4 shadow-card md:p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-cream p-3">
              <div className="text-xs text-gray-600">Current runway goal</div>
              <div className="text-lg font-semibold">
                {loadingSnap ? '—' : `${goal} days`}
              </div>
              <div className="mt-1 text-xs text-gray-600">Cap is 30 days (month-oriented runway)</div>
            </div>

            <div className="rounded-xl bg-cream p-3">
              <div className="text-xs text-gray-600">You’re currently at</div>
              <div className="text-lg font-semibold">
                {loadingSnap ? '—' : `${currentRegular} days`} <span className="text-gray-600">(Regular)</span>
              </div>
              <div className="text-sm text-emerald-700">{loadingSnap ? '' : `+${psDelta} with Power-Save`}</div>
              {errSnap && <div className="mt-2 text-xs text-red-600">{errSnap}</div>}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-cream p-3">
              <div>
                <div className="text-xs text-gray-600">Progress</div>
                <div className="text-lg font-semibold">{loadingSnap ? '—' : `${pctToGoal}%`} to goal</div>
              </div>
              <button
                onClick={() => setOpenAdjust(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-600"
              >
                <Target size={16} /> Adjust Goal
              </button>
            </div>
          </div>
        </div>

        {/* ML runway insight */}
        <div className="mb-4 rounded-2xl border border-soft bg-white p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">AI Runway Estimate</h3>
          </div>
          {mlLoading && <div className="text-sm text-gray-600">Running prediction…</div>}
          {mlErr && <div className="text-sm text-red-600">{mlErr}</div>}
          {ml && !mlLoading && !mlErr && (
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div>
                <div className="text-xs text-gray-600">Model-estimated runway</div>
                <div className="mt-1 text-xl font-semibold">
                  {ml.tier2.runway_days.toFixed(1)} days
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Model burn rate</div>
                <div className="mt-1 text-xl font-semibold">
                  {ml.tier2.burn_rate.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Risk signals (0–100%)</div>
                <div className="mt-1 space-y-0.5">
                  <div>Late-night: {(ml.tier3.risk_late_night * 100).toFixed(1)}%</div>
                  <div>Overspend: {(ml.tier3.risk_overspend * 100).toFixed(1)}%</div>
                  <div>Guilt: {(ml.tier3.risk_guilt * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Goal trend chart */}
        <section className="mb-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-soft bg-white p-4 shadow-card lg:col-span-2">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp size={18} className="text-brand-500" />
              <h3 className="font-semibold">
                Runway trend ({timeRange === 'week' ? 'last 7 days' : timeRange === 'month' ? 'last 30 days' : 'last 120 days'})
              </h3>
            </div>

            <div className="h-56 w-full">
              {errHist && <div className="px-2 pb-2 text-sm text-red-600">{errHist}</div>}
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={displayedHistory} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E25D37" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#E25D37" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="psFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tickLine={false} />
                  <YAxis tickLine={false} width={30} />
                  <Tooltip />
                  <Area type="monotone" dataKey="regular" stroke="#E25D37" fill="url(#regFill)" />
                  <Area type="monotone" dataKey="power" stroke="#10B981" fill="url(#psFill)" />
                </AreaChart>
              </ResponsiveContainer>
              {(!loadingHist && !displayedHistory.length) && (
                <div className="pt-4 text-center text-sm text-gray-600">
                  No history yet — log some transactions to see trends.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Achievements */}
        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <Trophy size={18} className="text-brand-500" />
            <h2 className="font-semibold">Achievements & Milestones</h2>
          </div>

          {achievements.length === 0 ? (
            <div className="rounded-2xl border border-soft bg-white p-6 text-center shadow-card">
              <Sparkles className="mx-auto mb-2 text-gray-400" />
              <p className="mb-2 text-lg font-medium">No achievements yet</p>
              <p className="text-gray-600">Log a few expenses and you’ll start earning badges quickly.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map(a => (
                <button
                  key={a.id}
                  onClick={() => setActiveAch(a)}
                  className="group rounded-2xl border border-soft bg-white p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 rounded-full bg-cream px-2 py-1 text-xs text-gray-700">
                      🏆 Achievement
                    </span>
                    <span className="text-xs text-gray-500 group-hover:text-gray-700">
                      {new Date(a.earned_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-base font-semibold">{a.name}</div>
                  <div className="mt-1 text-sm text-gray-600">Unlocked on {new Date(a.earned_at).toDateString()}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      {openAdjust && snapshot && (
        <AdjustGoalModal
          initial={snapshot.goal_days}
          onClose={() => setOpenAdjust(false)}
          onSave={handleSaveGoal}
        />
      )}
      {activeAch && (
        <AchievementModal achievement={activeAch as unknown as Achievement} onClose={() => setActiveAch(null)} />
      )}
    </AppLayout>
  )
}
