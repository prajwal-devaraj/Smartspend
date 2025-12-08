import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { setOnboarding, setUser } from '@/lib/auth'

const dashboardIllustration = '/logo1.jpg'

// IMPORTANT: set VITE_API_BASE to something like: http://127.0.0.1:5000/api/v1
const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:5000/api/v1'

// Helper: accept either access_token | access | token
function pickAccess(d: any): string | undefined {
  return d?.access_token ?? d?.access ?? d?.token
}

function getPasswordStrength(pw: string) {
  let strength = 0
  if (pw.length >= 8) strength++
  if (/[A-Z]/.test(pw)) strength++
  if (/[a-z]/.test(pw)) strength++
  if (/[0-9]/.test(pw)) strength++
  if (/[^A-Za-z0-9]/.test(pw)) strength++

  if (strength <= 2) return { label: 'Weak', color: 'text-red-600' }
  if (strength <= 4) return { label: 'Moderate', color: 'text-yellow-600' }
  return { label: 'Strong', color: 'text-green-600' }
}

export default function Signup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwFocus, setPwFocus] = useState(false)
  const [confirmFocus, setConfirmFocus] = useState(false)
  const [err, setErr] = useState('')

  const pwStrength = getPasswordStrength(password)
  const rules = [
    { test: password.length >= 8, label: 'At least 8 characters' },
    { test: /[A-Z]/.test(password), label: 'At least one uppercase letter' },
    { test: /[a-z]/.test(password), label: 'At least one lowercase letter' },
    { test: /[0-9]/.test(password), label: 'At least one number' },
    { test: /[^A-Za-z0-9]/.test(password), label: 'At least one special character' },
  ]
  const allRulesPassed = rules.every(r => r.test)
  const pwSectionOpen = pwFocus || confirmFocus

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (/^[A-Za-z\s]*$/.test(value)) setName(value)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    if (!name.trim()) return setErr('Name field is empty.')
    if (!email.trim()) return setErr('Email field is empty.')
    if (!password.trim()) return setErr('Password field is empty.')
    if (!confirm.trim()) return setErr('Confirm Password field is empty.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Please enter a valid email address.')
    if (!allRulesPassed) return setErr('Please satisfy all password rules before continuing.')
    if (password !== confirm) return setErr('Passwords do not match.')

    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      if (!res.ok) {
        const txt = await res.text()
        try {
          const j = JSON.parse(txt)
          setErr(j.message || j.error || `Signup failed (${res.status})`)
        } catch {
          setErr(txt || `Signup failed (${res.status})`)
        }
        return
      }

      const data: any = await res.json()

      // Token (optional at signup)
      const access = pickAccess(data)
      if (access) localStorage.setItem('access', access)
      else localStorage.removeItem('access')

      // Accept either { user: {...} } or legacy { user_id }
      const user = data.user ?? {
        id: data.user_id,
        name,
        email,
        status: data.status ?? 'pending_onboarding',
      }

      if (!user?.id) {
        setErr('Unexpected response from server.')
        return
      }

      // Persist ids / tokens
      localStorage.setItem('userId', String(user.id))
      localStorage.removeItem('refresh') // no refresh issued at signup

      // Save minimal user shell
      setUser({
        id: String(user.id),
        name: user.name ?? name,
        email: user.email ?? email,
        status: user.status ?? 'pending_onboarding',
      })

      // Decide next route
      const step =
        data.onboarding?.step ??
        (data.scope === 'onboarding' ? 'balance' : 'done')

      setOnboarding(step)
      if (step === 'balance') nav('/onboarding/balance', { replace: true })
      else nav('/', { replace: true })
    } catch (e: any) {
      setErr(e?.message || 'Network error. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#FCFAF7] flex items-center justify-center">
      <div className="flex flex-col md:flex-row max-w-7xl w-full mx-auto py-10 px-4">
        {/* Left: Illustration */}
        <div className="flex-1 flex flex-col items-start justify-center pr-0 md:pr-10 mb-8 md:mb-0">
          <div className="flex items-center mb-4">
            <img src="/favicon.svg" alt="SmartSpend" className="h-10 w-10 mr-2" />
            <span className="text-xl font-semibold text-gray-900">SmartSpend</span>
          </div>
          <h2 className="mb-2 text-3xl md:text-4xl font-bold text-gray-900">
            Start smarter with SmartSpend 💡
          </h2>
          <p className="mb-5 text-gray-600 text-left w-full max-w-xl">
            Create your account to predict days left, control spending, and build better money habits.
          </p>
          <img
            src={dashboardIllustration}
            alt="Financial dashboard, charts, and piggy bank"
            className="rounded-xl bg-white w-full max-w-md shadow-sm"
            draggable={false}
          />
        </div>

        {/* Right: Signup Form */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
          <h1 className="mb-1 text-xl font-semibold">Create account</h1>
          <p className="mb-4 text-sm text-gray-600">Start with a quick setup.</p>

          {err && (
            <div
              role="alert"
              className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <Input
              label="Name"
              value={name}
              onChange={handleNameChange}
              placeholder="Enter your name"
            />
            <Input
              label="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            {/* Password */}
            <div className="relative">
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                onFocus={() => setPwFocus(true)}
                onBlur={() => setTimeout(() => setPwFocus(false), 150)}
                autoComplete="new-password"
              />
              {password && (
                <p className={`mt-1 text-xs font-medium ${pwStrength.color}`}>
                  Strength: {pwStrength.label}
                </p>
              )}
            </div>

            {/* Password Rules */}
            <div
              className={`overflow-hidden transition-all duration-300 ${
                pwSectionOpen ? 'max-h-96 py-2 mb-1' : 'max-h-0 py-0 mb-0'
              }`}
              aria-hidden={!pwSectionOpen}
            >
              <div className="bg-gray-50 rounded-lg px-3 py-3 text-sm border border-gray-200">
                <p className="font-medium text-gray-700 mb-1">Password must include:</p>
                <ul className="space-y-1">
                  {rules.map((r, i) => {
                    const color = r.test ? 'text-green-600' : 'text-red-600'
                    return (
                      <li key={i} className={`flex items-center ${color}`}>
                        <span className="mr-2">
                          <span
                            className={`inline-block w-5 h-5 rounded-md ${
                              r.test ? 'bg-green-200' : 'bg-red-200'
                            }`}
                          ></span>
                        </span>
                        {r.label}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="relative">
              <Input
                label="Confirm Password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                onFocus={() => setConfirmFocus(true)}
                onBlur={() => setTimeout(() => setConfirmFocus(false), 150)}
                autoComplete="new-password"
              />
              {password && confirm && password !== confirm && (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  Passwords do not match
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!name || !email || !password || !confirm || !allRulesPassed || password !== confirm}
            >
              Continue
            </Button>
          </form>

          <p className="mt-3 text-center text-xs text-gray-500">
            No credit card needed • Takes less than 1 minute
          </p>
          <div className="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 underline-offset-2 hover:underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
