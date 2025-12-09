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
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

import { predictFromFeatures, type MlResponse } from '@/lib/ml'

// ---------------- TYPES ----------------
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

type HistoryPoint = {
  d: string
  regular: number
  power: number
}

type UserAchievementRow = {
  user_achievement_id: number
  earned_at: string
  achievement_id: number
  code: string
  name: string
  description?: string
  icon?: string
}

type UiAchievement = {
  id: number
  name: string
  earned_at: string
  description?: string
  icon?: string
  code?: string
}

type DashboardKpis = {
  avg_daily_burn_cents: number
  balance_cents: number
  runway: {
    days_left_regular: number
    days_left_power_save: number
  }
}

const getUserId = () => Number(localStorage.getItem('userId') || 0)

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function GoalsPage() {
  const [params, setParams] = useSearchParams()
  const urlRange = (params.get('range') as 'week' | 'month' | 'all' | null) ?? 'month'

  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>(urlRange)
  const [openAdjust, setOpenAdjust] = useState(false)

  // server state
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [achievements, setAchievements] = useState<UiAchievement[]>([])
  const [activeAch, setActiveAch] = useState<UiAchievement | null>(null)

  const [loadingSnap, setLoadingSnap] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)
  const [errSnap, setErrSnap] = useState('')
  const [errHist, setErrHist] = useState('')

  // RUNWAY unified with Dashboard
  const [regularRunway, setRegularRunway] = useState(0)
  const [powerRunway, setPowerRunway] = useState(0)

  // Burn rate fix — from Dashboard
  const [dashBurn, setDashBurn] = useState(0)

  // ML
  const [ml, setMl] = useState<MlResponse | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlErr, setMlErr] = useState('')

  // Keep URL synced
  useEffect(() => {
    const next = new URLSearchParams(params)
    next.set('range', timeRange)
    setParams(next, { replace: true })
  }, [timeRange])

  // ---------------- LOAD SNAPSHOT ----------------
  const loadSnapshot = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return

    setErrSnap('')
    setLoadingSnap(true)
    try {
      const data = await get<Snapshot>('/goals/snapshot', { user_id })
      setSnapshot(data)
    } catch (e: any) {
      setErrSnap(e?.message || 'Failed to load goal snapshot')
      setSnapshot(null)
    }
    setLoadingSnap(false)
  }, [])

  // ---------------- LOAD HISTORY ----------------
  const loadHistory = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return

    setErrHist('')
    setLoadingHist(true)
    try {
      const res = await get<{ points: HistoryPoint[] }>('/goals/history', {
        user_id,
        days: 120,
      })
      setHistory(res?.points || [])
    } catch (e: any) {
      setErrHist(e?.message || 'Failed to load runway history')
      setHistory([])
    }
    setLoadingHist(false)
  }, [])

  // ---------------- LOAD ACHIEVEMENTS ----------------
  const loadAchievements = useCallback(async () => {
    const user_id = getUserId()
    if (!user_id) return

    try {
      const res = await get<{ items: UserAchievementRow[] }>('/achievements/user', {
        user_id,
      })
      const mapped = res.items.map((r) => ({
        id: r.user_achievement_id,
        name: r.name,
        earned_at: r.earned_at,
        description: r.description,
        icon: r.icon,
        code: r.code,
      }))
      setAchievements(mapped)
    } catch {
      setAchievements([])
    }
  }, [])

  // ---------------- LOAD DASHBOARD KPIs ----------------
  useEffect(() => {
    const user_id = getUserId()
    if (!user_id) return

    get<DashboardKpis>('/dashboard/kpis', { user_id })
      .then((res) => {
        setRegularRunway(res.runway.days_left_regular || 0)
        setPowerRunway(res.runway.days_left_power_save || 0)
        setDashBurn((res.avg_daily_burn_cents || 0) / 100) // FIXED
      })
      .catch(() => {
        setRegularRunway(0)
        setPowerRunway(0)
        setDashBurn(0)
      })
  }, [])

  // INITIAL LOAD
  useEffect(() => {
    void loadSnapshot()
    void loadHistory()
    void loadAchievements()
  }, [loadSnapshot, loadHistory, loadAchievements])

  // ---------------- COMPUTED ----------------
  const goal = snapshot?.goal_days ?? 30
  const currentRegular = regularRunway
  const powerSave = powerRunway
  const psDelta = Math.max(0, powerSave - currentRegular)

  const pctToGoal = useMemo(() => {
    if (!goal) return 0
    return Math.round((currentRegular / goal) * 100)
  }, [goal, currentRegular])

  const displayedHistory = useMemo(() => {
    if (!history?.length) return []
    if (timeRange === 'week') return history.slice(-7)
    if (timeRange === 'month') return history.slice(-30)
    return history
  }, [history, timeRange])

  // ---------------- SAVE GOAL ----------------
  const handleSaveGoal = async (n: number) => {
    const user_id = getUserId()
    if (!user_id) return

    const capped = Math.max(1, Math.min(30, n))
    try {
      await patch('/goals/target', { user_id, target_days: capped })
      setOpenAdjust(false)
      await loadSnapshot()
    } catch {
      setOpenAdjust(false)
    }
  }

  // ---------------- RUN ML USING DASHBOARD BURN RATE ----------------
  useEffect(() => {
    if (!snapshot) return

    const bal = (snapshot.basis.balance_cents || 0) / 100
    const burn = dashBurn || 0

    const features = [
      bal,
      burn,
      30,
      goal,
      currentRegular,
      powerSave,
      psDelta,
      0, 0, 0, 0,
    ]

    setMlLoading(true)
    setMlErr('')
    predictFromFeatures(features)
      .then(setMl)
      .catch((e) => setMlErr(e.message || 'ML prediction failed'))
      .finally(() => setMlLoading(false))
  }, [snapshot, dashBurn, goal, currentRegular, powerSave, psDelta])

  // =============================================================================
  // UI
  // =============================================================================

  const pill = (value: 'week' | 'month' | 'all', label: string) => (
    <button
      key={value}
      onClick={() => setTimeRange(value)}
      className={`rounded-xl border px-3 py-1.5 text-sm ${
        timeRange === value
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-soft bg-white hover:bg-cream'
      }`}
    >
      {label}
    </button>
  )

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1440px] px-3 py-4 sm:px-4">

        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Goals & Achievements</h1>
          <div className="flex gap-2">
            {pill('week', 'Last 7 days')}
            {pill('month', 'Last 30 days')}
            {pill('all', 'All-time')}
          </div>
        </div>

        {/* ================= SNAPSHOT ================= */}
        <div className="mb-4 rounded-2xl border border-soft bg-white p-4 shadow-card">
          <div className="grid gap-3 md:grid-cols-3">

            <div className="rounded-xl bg-cream p-3">
              <div className="text-xs text-gray-600">Current runway goal</div>
              <div className="text-lg font-semibold">{goal} days</div>
              <div className="text-xs text-gray-600">Cap is 30 days</div>
            </div>

            <div className="rounded-xl bg-cream p-3">
              <div className="text-xs text-gray-600">You’re currently at</div>
              <div className="text-lg font-semibold">
                {currentRegular} days (Regular)
              </div>
              <div className="text-sm text-emerald-700">+{psDelta} with Power-Save</div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-cream p-3">
              <div>
                <div className="text-xs text-gray-600">Progress</div>
                <div className="text-lg font-semibold">{pctToGoal}% to goal</div>
              </div>

              <button
                className="rounded-xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-600 flex items-center gap-2"
                onClick={() => setOpenAdjust(true)}
              >
                <Target size={16} /> Adjust Goal
              </button>
            </div>

          </div>
        </div>

        {/* ================= AI RUNWAY ================= */}
        <div className="mb-4 rounded-2xl border border-soft bg-white p-4 shadow-card">
          <h3 className="text-sm font-semibold mb-2">Runway Estimate</h3>

          {mlLoading && <div className="text-sm text-gray-600">Running prediction…</div>}
          {mlErr && <div className="text-sm text-red-600">{mlErr}</div>}

          {ml && !mlLoading && !mlErr && (
            <div className="grid md:grid-cols-3 gap-3 text-sm">
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
                <div className="text-xs text-gray-600">Risk signals (0-100%)</div>
                <div className="mt-1">
                  <div>Late-night: {(ml.tier3.risk_late_night * 100).toFixed(1)}%</div>
                  <div>Overspend: {(ml.tier3.risk_overspend * 100).toFixed(1)}%</div>
                  <div>Guilt: {(ml.tier3.risk_guilt * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= HISTORY CHART (RESTORED) ================= */}
        <div className="mb-4 rounded-2xl border border-soft bg-white p-4 shadow-card">

          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={18} className="text-brand-500" />
            <h3 className="font-semibold">
              Runway trend (
              {timeRange === 'week'
                ? 'last 7 days'
                : timeRange === 'month'
                ? 'last 30 days'
                : 'last 120 days'}
              )
            </h3>
          </div>

          <div className="h-56">
            {errHist && <p className="text-red-600 text-sm">{errHist}</p>}

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayedHistory}>
                <defs>
                  <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E25D37" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#E25D37" stopOpacity={0} />
                  </linearGradient>

                  <linearGradient id="psFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tickLine={false} />
                <YAxis width={30} tickLine={false} />
                <Tooltip />

                <Area
                  type="monotone"
                  dataKey="regular"
                  stroke="#E25D37"
                  fill="url(#regFill)"
                />
                <Area
                  type="monotone"
                  dataKey="power"
                  stroke="#10B981"
                  fill="url(#psFill)"
                />
              </AreaChart>
            </ResponsiveContainer>

            {!loadingHist && displayedHistory.length === 0 && (
              <div className="text-center text-gray-600 text-sm mt-4">
                No history yet — log transactions to see trends.
              </div>
            )}
          </div>
        </div>

        {/* ================= ACHIEVEMENTS ================= */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={18} className="text-brand-500" />
            <h2 className="font-semibold">Achievements & Milestones</h2>
          </div>

          {achievements.length === 0 ? (
            <div className="rounded-2xl border border-soft bg-white p-6 text-center shadow-card">
              <Sparkles className="mx-auto mb-2 text-gray-400" />
              <p className="text-lg font-medium mb-1">No achievements yet</p>
              <p className="text-gray-600">Log a few expenses to start earning badges.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActiveAch(a)}
                  className="rounded-2xl border border-soft bg-white p-4 text-left shadow-card hover:-translate-y-0.5 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="bg-cream px-2 py-1 rounded-full text-xs">🏆 Achievement</span>
                    <span className="text-xs text-gray-500">
                      {new Date(a.earned_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="font-semibold">{a.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* MODALS */}
      {openAdjust && snapshot && (
        <AdjustGoalModal
          initial={snapshot.goal_days}
          onClose={() => setOpenAdjust(false)}
          onSave={handleSaveGoal}
        />
      )}

      {activeAch && (
        <AchievementModal
          achievement={activeAch as unknown as Achievement}
          onClose={() => setActiveAch(null)}
        />
      )}
    </AppLayout>
  )
}
