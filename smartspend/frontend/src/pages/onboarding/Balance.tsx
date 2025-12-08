import { useState } from 'react'
import OBShell from '@/components/onboarding/OBShell'
import OBProgress from '@/components/onboarding/OBProgress'
import CurrencyInput from '@/components/ui/CurrencyInput'
import { PrimaryCTA } from '@/components/ui/CTA'
import { useNavigate } from 'react-router-dom'
import { setOnboarding } from '@/lib/auth'

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5000/api/v1'

export default function Balance() {
  const [amt, setAmt] = useState('0') // in whole currency units as string
  const [err, setErr] = useState('')
  const nav = useNavigate()

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (/^\d*$/.test(value)) {
      setAmt(value.replace(/^0+(?=\d)/, '') || '0')
    }
  }

  const handleContinue = async () => {
    setErr('')
    const userId = Number(localStorage.getItem('userId') || 0)
    if (!userId) {
      setErr('Please login again.')
      return
    }
    const cents = Math.max(0, Math.round(Number(amt) * 100))

    try {
      // This stores expected monthly income (preference) and ensures period with opening=0
      const res = await fetch(`${API}/budget/period`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access') || ''}`,
        },
        body: JSON.stringify({ user_id: userId, monthly_income_cents: cents }),
      })
      if (!res.ok) {
        const txt = await res.text()
        try {
          const j = JSON.parse(txt)
          throw new Error(j.message || j.error || `Failed (${res.status})`)
        } catch {
          throw new Error(txt || `Failed (${res.status})`)
        }
      }

      // proceed → cadence
      setOnboarding('pay')
      nav('/onboarding/pay-cadence', { replace: true })
    } catch (e: any) {
      setErr(e?.message || 'Network error. Please try again.')
    }
  }

  return (
    <OBShell>
      <OBProgress step={1} />
      <h1 className="mx-auto mb-5 max-w-2xl text-center text-[28px] font-extrabold leading-tight tracking-tight md:text-[36px]">
        What will be your income?
      </h1>

      <div className="mx-auto mb-3 w-full max-w-lg">
        <CurrencyInput
          value={amt}
          onChange={handleAmountChange}
          inputMode="numeric"
          pattern="[0-9]*"
        />
        <p className="mt-3 text-center text-sm text-gray-600">
          We’ll start tracking from here. You can update anytime.
        </p>
      </div>

      {err && (
        <div className="mx-auto mb-3 max-w-lg rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="mx-auto w-full max-w-lg">
        <PrimaryCTA onClick={handleContinue}>Continue</PrimaryCTA>
      </div>
    </OBShell>
  )
}
