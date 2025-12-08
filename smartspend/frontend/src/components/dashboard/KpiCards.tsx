import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Card, CardTitle } from '@/components/ui/Card'
import ProgressBar from '@/components/ui/ProgressBar'
import { formatCurrency } from '@/lib/format'
import { get } from '@/lib/api'

type Runway = {
  days_left_regular: number
  days_left_power_save: number
}

type DashboardKpis = {
  balance_cents: number
  avg_daily_burn_cents: number
  projected_next7_burn_cents: number
  runway: Runway
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

// Helper that ONLY reads the original balance set at onboarding/reset
function getOriginalBalance(): number {
  return Number(localStorage.getItem('smartspend.original_balance')) || 1
}

// Shared hook to load dashboard KPIs from backend
function useDashboardKpis() {
  const [data, setData] = useState<DashboardKpis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await get<DashboardKpis>('/dashboard/kpis', { user_id: uid })
        if (!cancelled) setData(res)
      } catch (e) {
        console.error('Failed to load dashboard KPIs', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}

function loadBills() {
  try {
    const raw = localStorage.getItem('smartspend.bills')
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export function BalanceCard() {
  const navigate = useNavigate()
  const { data } = useDashboardKpis()

  const balance = data ? (data.balance_cents || 0) / 100 : 0
  const [bills, setBills] = useState(() => loadBills())

  // Update bills when localStorage changes (react to edits in /bills)
  useEffect(() => {
    function update() {
      setBills(loadBills())
    }
    window.addEventListener('storage', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('focus', update)
    }
  }, [])

  // Only count active bills
  const billsTotal = bills
    .filter((b: any) => (b.status ?? 'active') !== 'paused')
    .reduce((s: number, b: any) => s + (b.amount || 0), 0)

  const afterBills = balance - billsTotal
  const originalBalance = getOriginalBalance()

  const pctLeft = originalBalance ? (balance / originalBalance) * 100 : 0

  let barColor = 'bg-emerald-500' // Green
  if (pctLeft <= 10) {
    barColor = 'bg-red-500'
  } else if (pctLeft <= 20) {
    barColor = 'bg-orange-400'
  } else if (pctLeft <= 50) {
    barColor = 'bg-blue-500'
  }

  return (
    <div
      className="cursor-pointer transition-all hover:shadow-lg hover:border-brand-500 rounded-2xl"
      onClick={() => navigate('/transactions')}
      tabIndex={0}
      role="button"
      aria-label="Go to transactions"
      style={{ outline: 'none' }}
    >
      <Card>
        <CardTitle>Current Balance</CardTitle>
        <div className="text-3xl font-bold">{formatCurrency(balance)}</div>
        <p className="mt-1 text-sm text-gray-600">
          After upcoming bills: {formatCurrency(afterBills)}
        </p>
        <div className="mt-3">
          <ProgressBar value={balance} max={originalBalance} barColor={barColor} />
        </div>
      </Card>
    </div>
  )
}

export function DaysLeftCard() {
  const { data } = useDashboardKpis()

  const daysRegular = data?.runway?.days_left_regular ?? 0
  const daysPower = data?.runway?.days_left_power_save ?? 0

  // If user has set a goal, prefer that label; otherwise show current runway.
  const goalDaysRaw = localStorage.getItem('smartspend.goal_days')
  const goalDays = goalDaysRaw ? Number(goalDaysRaw) : daysRegular || 30

  const showPowerSave = daysPower > daysRegular

  return (
    <Card>
      <CardTitle>Days Left</CardTitle>
      <div className="text-3xl font-bold">
        {daysRegular || goalDays}{' '}
        <span className="text-base font-medium text-gray-600 align-middle">
          today
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar value={daysRegular || goalDays} max={goalDays || 30} />
      </div>
      {showPowerSave && (
        <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
          <span>Power-Save</span>
          <span className="font-medium">{daysPower}</span>
        </div>
      )}
    </Card>
  )
}

export function DailyBurnCard() {
  const { data } = useDashboardKpis()
  const avg = data ? (data.avg_daily_burn_cents || 0) / 100 : 0

  return (
    <Card>
      <CardTitle>Burn Rate</CardTitle>
      <div className="text-3xl font-bold">{formatCurrency(avg)}</div>
      <p className="mt-1 text-sm text-gray-600">Avg per day (last 30 days)</p>
    </Card>
  )
}

export function Next7DaysBurnCard() {
  const { data } = useDashboardKpis()
  const totalNext7 = data ? (data.projected_next7_burn_cents || 0) / 100 : 0

  return (
    <Card>
      <CardTitle>Next 7 Days Burn</CardTitle>
      <div className="text-3xl font-bold">{formatCurrency(totalNext7)}</div>
      <p className="mt-1 text-sm text-gray-600">Projected if you keep this pace</p>
    </Card>
  )
}
