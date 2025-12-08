import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { clearUser } from '@/lib/auth'

// Helper to get current user from storage
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
}
function getInitials(name: string | undefined) {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((s) => s[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'U'
}

type ItemDef = { label: string; to?: string; action?: () => void; destructive?: boolean }

export default function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const loc = useLocation()

  const user = getCurrentUser()
  const initials = getInitials(user?.name)

  const items: ItemDef[] = [
    { label: 'Profile', to: '/profile' },
    { label: 'Notifications', to: '/profile/notifications' },
    { label: '—divider—' },
    { label: 'Logout', action: () => { clearUser(); nav('/login', { replace: true }) }, destructive: true },
  ]

  useEffect(() => { setOpen(false) }, [loc.pathname])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return
      if (!menuRef.current?.contains(e.target as Node) &&
          !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const btn = menuRef.current?.querySelector<HTMLButtonElement>('[data-mi="0"]')
        btn?.focus()
      })
    } else {
      triggerRef.current?.focus()
    }
  }, [open])

  const openMenu = () => { setActive(0); setOpen(true) }
  const closeMenu = () => setOpen(false)

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    }
  }

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const actionable = items.filter(i => i.label !== '—divider—')
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return }
    if (e.key === 'Tab') { closeMenu(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (active + 1) % actionable.length
      setActive(next)
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-mi="${next}"]`)?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (active - 1 + actionable.length) % actionable.length
      setActive(next)
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-mi="${next}"]`)?.focus()
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-mi="0"]`)?.focus()
    }
    if (e.key === 'End') {
      e.preventDefault()
      const last = actionable.length - 1
      setActive(last)
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-mi="${last}"]`)?.focus()
    }
  }

  const actionable = items.filter(i => i.label !== '—divider—')

  return (
    <div className="relative">
      {/* Initials Button as Trigger */}
      <button
        ref={triggerRef}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className="h-9 w-9 rounded-full border-2 border-white shadow-sm bg-cream flex items-center justify-center text-lg font-semibold text-brand-600 select-none focus:outline-none focus:ring-2 focus:ring-brand-300"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="profile-menu"
      >
        {initials}
      </button>

      {/* Menu */}
      {open && (
        <div
          id="profile-menu"
          role="menu"
          aria-label="Profile"
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 mt-2 w-56 rounded-2xl border border-soft bg-white p-2 shadow-card animate-[fadeIn_120ms_ease-out] origin-top-right"
        >
          {items.map((item, i) => {
            if (item.label === '—divider—') {
              return <div key={`div-${i}`} className="my-1 h-px bg-soft" aria-hidden="true" />
            }
            const idx = actionable.indexOf(item)
            return (
              <button
                key={item.label}
                data-mi={idx}
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  closeMenu()
                  if (item.to) nav(item.to)
                  if (item.action) item.action()
                }}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition
                  ${item.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-800 hover:bg-brand-50'}`}
                onMouseEnter={() => setActive(idx)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
