import OBShell from '@/components/onboarding/OBShell'
import OBProgress from '@/components/onboarding/OBProgress'
import Pill from '@/components/ui/Pill'
import { PrimaryCTA, LinkCTA } from '@/components/ui/CTA'
import { setOnboarding } from '@/lib/auth'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5000/api/v1'

const defaults = ['Rent', 'Phone', 'Internet', 'Subscriptions', 'Others']
const otherOptions = ['Groceries', 'Insurance', 'Tuition', 'Medical', 'Childcare']
const numDays = Array.from({ length: 31 }, (_, i) => (i + 1).toString())

type BillData = {
  label: string
  amount: string // currency string
  day: string    // 1..31
}

export default function BillsOB() {
  const [chosen, setChosen] = useState<string[]>([])
  const [otherChosen, setOtherChosen] = useState<string[]>([])
  const [billValues, setBillValues] = useState<Record<string, BillData>>({})
  const [customBills, setCustomBills] = useState<BillData[]>([])
  const [customLabel, setCustomLabel] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const [customDay, setCustomDay] = useState('1')
  const [activeBill, setActiveBill] = useState<null | { label: string }>(null)
  const [err, setErr] = useState('')

  const nav = useNavigate()

  function handleBillPill(x: string) {
    if (x === 'Others') {
      if (!chosen.includes('Others')) setChosen(c => [...c, 'Others'])
      return
    }
    setActiveBill({ label: x })
    const d = billValues[x]
    setCustomLabel(x)
    setCustomAmount(d?.amount ?? '')
    setCustomDay(d?.day ?? '1')

    if (defaults.includes(x) && !chosen.includes(x)) setChosen(c => [...c, x])
    if (otherOptions.includes(x) && !otherChosen.includes(x)) setOtherChosen(o => [...o, x])
  }

  function savePopup() {
    if (!customLabel.trim() || !customAmount.trim() || !customDay.trim()) return
    setBillValues(v => ({ ...v, [customLabel]: { label: customLabel, amount: customAmount, day: customDay } }))
    if (defaults.includes(customLabel) && !chosen.includes(customLabel)) setChosen(c => [...c, customLabel])
    if (otherOptions.includes(customLabel) && !otherChosen.includes(customLabel)) setOtherChosen(o => [...o, customLabel])
    setActiveBill(null)
    setCustomLabel('')
    setCustomAmount('')
    setCustomDay('1')
  }

  function handleAddCustom() {
    if (!customLabel.trim() || !customAmount.trim() || !customDay.trim()) return
    setCustomBills(bills => [...bills, { label: customLabel.trim(), amount: customAmount, day: customDay }])
    setBillValues(vals => ({ ...vals, [customLabel.trim()]: { label: customLabel.trim(), amount: customAmount, day: customDay } }))
    setCustomLabel('')
    setCustomAmount('')
    setCustomDay('1')
  }

  function handleRemoveCustom(label: string) {
    setCustomBills(bills => bills.filter(b => b.label !== label))
    setBillValues(vals => {
      const copy = { ...vals }
      delete copy[label]
      return copy
    })
  }

  async function finish() {
    setErr('')
    const userId = Number(localStorage.getItem('userId') || 0)
    const access = localStorage.getItem('access') || ''
    if (!userId || !access) {
      setErr('Please login again.')
      return
    }

    // Prepare bills payload if you have /onboarding/bills implemented
    const allLabels = Array.from(new Set<string>([
      ...chosen.filter(x => x !== 'Others'),
      ...otherChosen,
      ...customBills.map(c => c.label),
    ]))
    const billsPayload = allLabels
      .map(label => billValues[label])
      .filter(Boolean)
      .map(b => ({
        name: b.label,
        amount_cents: Math.max(0, Math.round(Number(b.amount) * 100)) || undefined,
        recurrence_rule: 'monthly' as const,
        next_due_date: dayToNextDate(b.day), // 'YYYY-MM-DD'
      }))

    try {
      // (Optional) Try to create bills; ignore 404 if not implemented
      if (billsPayload.length > 0) {
        const r = await fetch(`${API}/onboarding/bills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
          body: JSON.stringify({ user_id: userId, bills: billsPayload }),
        })
        if (!r.ok && r.status !== 404) {
          const txt = await r.text()
          try {
            const j = JSON.parse(txt)
            throw new Error(j.message || j.error || `Failed to save bills (${r.status})`)
          } catch {
            throw new Error(txt || `Failed to save bills (${r.status})`)
          }
        }
      }

      // Always complete onboarding → activates + credits onboarding income; returns app access
      const res = await fetch(`${API}/onboarding/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) {
        const txt = await res.text()
        try {
          const j = JSON.parse(txt)
          throw new Error(j.message || j.error || `Failed to finish onboarding (${res.status})`)
        } catch {
          throw new Error(txt || `Failed to finish onboarding (${res.status})`)
        }
      }
      const data = await res.json()
      const newAccess = data?.access || data?.access_token
      if (newAccess) localStorage.setItem('access', newAccess)
      // If backend later adds refresh_token here, store it too:
      if (data?.refresh_token) localStorage.setItem('refresh', data.refresh_token)

      setOnboarding('done')
      // Go straight to dashboard (user is now active)
      nav('/dashboard', { replace: true })
    } catch (e: any) {
      setErr(e?.message || 'Network error. Please try again.')
    }
  }

  function dayToNextDate(dayStr: string): string {
    const today = new Date()
    const y = today.getUTCFullYear()
    let m = today.getUTCMonth() // 0-based
    const dom = Math.max(1, Math.min(31, Number(dayStr) || 1))

    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const d = Math.min(dom, daysInMonth)
    let candidate = new Date(Date.UTC(y, m, d))
    if (candidate < new Date(Date.UTC(y, m, today.getUTCDate()))) {
      m += 1
      const daysInMonth2 = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const d2 = Math.min(dom, daysInMonth2)
      candidate = new Date(Date.UTC(y, m, d2))
    }
    const iso = candidate.toISOString().slice(0, 10) // YYYY-MM-DD
    return iso
  }

  return (
    <OBShell>
      <OBProgress step={3} />
      <h1 className="mb-5 text-center text-3xl font-bold leading-tight md:text-4xl">
        Any regular bills we should plan for?
      </h1>

      <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
        {defaults.map(x => (
          <Pill key={x} active={chosen.includes(x)} onClick={() => handleBillPill(x)}>
            {x}
            {billValues[x]?.amount && (
              <span className="ml-1 text-xs text-gray-600">
                (${billValues[x].amount}), Day {billValues[x].day}
              </span>
            )}
          </Pill>
        ))}
      </div>

      {/* Show other options when "Others" selected */}
      {chosen.includes('Others') && (
        <div className="mx-auto mt-4 max-w-sm flex flex-col items-center">
          <div className="mb-2 text-sm text-gray-700">Select additional bill types:</div>
          <div className="grid grid-cols-2 gap-2 w-full mb-3">
            {otherOptions.map(opt => (
              <Pill key={opt} active={otherChosen.includes(opt)} onClick={() => handleBillPill(opt)}>
                {opt}
                {billValues[opt]?.amount && (
                  <span className="ml-1 text-xs text-gray-600">
                    (${billValues[opt].amount}), Day {billValues[opt].day}
                  </span>
                )}
              </Pill>
            ))}
          </div>

          {/* Custom bill adder */}
          <div className="w-full flex flex-col gap-1 mb-2">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1 text-sm"
                type="text"
                placeholder="Other bill type"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
              />
              <input
                className="w-20 rounded border px-2 py-1 text-sm"
                type="number"
                min={0}
                placeholder="Amount"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
              />
              <select
                className="w-20 rounded border px-2 py-1 text-sm"
                value={customDay}
                onChange={e => setCustomDay(e.target.value)}
              >
                {numDays.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button
                className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-orange-900 font-medium text-sm"
                type="button"
                onClick={handleAddCustom}
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              {customBills.map(bill => (
                <span key={bill.label} className="inline-flex items-center rounded bg-orange-50 border border-orange-200 px-2 py-1 text-sm text-orange-900">
                  {bill.label} (${bill.amount}) Day {bill.day}
                  <button className="ml-1 text-orange-700 focus:outline-none" onClick={() => handleRemoveCustom(bill.label)}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Popup for entering amount/day */}
      {activeBill && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-5 shadow-md min-w-[320px]">
            <h2 className="mb-3 text-lg font-semibold">
              Enter details for {activeBill.label}
            </h2>
            <div className="flex flex-col gap-3">
              <input
                className="rounded border px-3 py-2 text-sm"
                type="number"
                min={0}
                placeholder="Amount"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                autoFocus
              />
              <select
                className="rounded border px-3 py-2 text-sm"
                value={customDay}
                onChange={e => setCustomDay(e.target.value)}
              >
                {numDays.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex gap-3 justify-end mt-2">
                <button className="px-4 py-1 rounded bg-brand-500 text-white hover:bg-brand-600" type="button" onClick={savePopup}>
                  Save
                </button>
                <button className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300" type="button" onClick={() => setActiveBill(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="mx-auto mt-6 max-w-sm">
        <PrimaryCTA onClick={finish}>Finish</PrimaryCTA>
      </div>
      <div className="mt-2">
        <LinkCTA onClick={() => nav('/onboarding/pay-cadence')}>Back</LinkCTA>
      </div>
    </OBShell>
  )
}
