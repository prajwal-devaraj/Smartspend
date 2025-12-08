import { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function AuthShell({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const isLogin = pathname.includes('/login')

  const title = isLogin ? 'Welcome back 👋' : 'Start smarter with SmartSpend 💡'
  const sub = isLogin
    ? 'Welcome back to SmartSpend.'
    : 'Create your account to predict days left, control spending, and build better money habits.'

  const previewSrc = isLogin ? '/final_dash.png' : '/final_dash.png'
  const previewAlt = isLogin ? 'SmartSpend dashboard preview' : 'SmartSpend onboarding preview'

  return (
    <div className="min-h-screen bg-cream">
      {/* Skip link for screen readers / keyboard */}
      <a href="#auth-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded-md focus:bg-white focus:px-2 focus:py-1 focus:ring-2 focus:ring-brand-500">
        Skip to form
      </a>

      <header className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5 md:px-6" aria-label="Brand header">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 overflow-hidden ring-1 ring-brand-200/60">
            <img src="/logo.png" alt="SmartSpend logo" className="h-9 w-9 object-contain" />
          </div>
          <span className="text-xl font-semibold text-gray-900">SmartSpend</span>
        </Link>
      </header>

      <main id="auth-main" className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 pb-12 md:grid-cols-2 md:px-6">
        {/* Left panel (hidden on small) */}
        <div className="hidden md:block">
          <section
            aria-label={isLogin ? 'Welcome back message' : 'Welcome message for new users'}
            className="card rounded-[24px] p-8"
          >
            <h1 className="mb-2 text-3xl font-semibold text-gray-900">{title}</h1>
            <p className="text-gray-700">{isLogin ? 'Track your balance, predict days left, and coach smarter micro-spends.' : sub}</p>

            {/* preview image with subtle animation, respects reduced motion */}
            <div className="mt-6 overflow-hidden rounded-2xl border border-soft">
              <img
                src={previewSrc}
                alt={previewAlt}
                className="w-full animate-[fadeIn_300ms_ease-out] motion-reduce:animate-none"
              />
            </div>
          </section>
        </div>

        {/* Right form panel */}
        <section className="mx-auto w-full max-w-md" aria-label="Authentication form">
          <div className="card rounded-[24px] p-6 md:p-8">
            {/* Title/sub copy here is kept in the page files for flexibility */}
            {children}
            {/* reassurance line below form is added in pages */}
          </div>
        </section>
      </main>
    </div>
  )
}
