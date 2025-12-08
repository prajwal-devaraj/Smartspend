// src/pages/Login.tsx
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { setUser, setOnboarding } from '@/lib/auth'
import { setTokens } from '@/lib/api'

const dashboardIllustration = '/logo1.jpg'
const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5000/api/v1'

// accept either access_token or access
const pickAccess = (d: any) => d?.access_token ?? d?.access ?? d?.token

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState<string>('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Please enter a valid email address.')
    if (!pw) return setErr('Password is required.')

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      })

      if (!res.ok) {
        const txt = await res.text()
        try {
          const j = JSON.parse(txt)
          setErr(j.message || j.error || `Login failed (${res.status})`)
        } catch {
          setErr(txt || `Login failed (${res.status})`)
        }
        return
      }

      const data: any = await res.json()
      const access = pickAccess(data)
      const scope: string | undefined = data?.scope
      const user = data?.user

      if (!access || !scope || !user?.id) {
        setErr('Unexpected response from server.')
        return
      }

      // persist tokens / ids
      localStorage.setItem('access', access)
      localStorage.setItem('userId', String(user.id))
      if (data.refresh_token) localStorage.setItem('refresh', data.refresh_token)
      else localStorage.removeItem('refresh')

      // keep fetch wrapper in sync (used by other API calls)
      setTokens({
        access,
        refresh: data.refresh_token,
        userId: String(user.id),
      })

      // cache minimal user
      setUser({
        id: String(user.id),
        name: user.name || '',
        email: user.email,
        status: user.status,
      })

      if (scope === 'onboarding') {
        setOnboarding('balance')
        nav('/onboarding/balance', { replace: true })
      } else {
        setOnboarding('done')
        const back = (loc.state as any)?.from?.pathname
        nav(back || '/dashboard', { replace: true })
      }
    } catch (e: any) {
      setErr(e?.message || 'Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#FCFAF7] flex items-center justify-center">
      <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-6xl mx-auto px-4 py-10">
        <div className="flex-1 flex flex-col items-start pr-0 md:pr-10 mb-8 md:mb-0">
          <div className="flex items-center mb-4">
            <img src="/favicon.svg" alt="SmartSpend" className="h-10 w-10 mr-2" />
            <span className="text-2xl font-medium text-[#222]">SmartSpend</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#222]">Welcome back 👋</h2>
          <p className="text-[#2c3640] mt-2">Track your balance, predict days left, and coach smarter micro-spends.</p>
          <img src={dashboardIllustration} alt="" className="rounded-xl bg-white w-full max-w-sm shadow-sm mt-4" />
        </div>

        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
          <h1 className="mb-1 text-xl font-bold text-[#222]">Log in</h1>
          <p className="mb-4 text-sm text-[#2c3640]">Welcome back to SmartSpend.</p>

          {err && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <Input label="Email" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" />
            <div className="relative">
              <Input label="Password" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-8 rounded-md px-2 py-1 text-sm text-[#2c3640] hover:bg-gray-100"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            <Button type="submit" className="font-semibold text-base">Log in</Button>
            <div className="mt-2 text-right">
              <Link to="/forgot-password" className="text-brand-600 hover:underline text-sm font-medium">
                Forgot password?
              </Link>
            </div>
          </form>

          <p className="mt-3 text-center text-xs text-[#6A6A6A]">Secure sign-in with encryption.</p>
          <div className="mt-4 text-center text-sm">
            No account? <Link to="/signup" className="text-brand-600 underline-offset-2 hover:underline font-semibold">Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
