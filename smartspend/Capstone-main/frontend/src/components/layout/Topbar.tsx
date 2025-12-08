import { Bell } from 'lucide-react'
import ProfileMenu from '@/components/profile/ProfileMenu'

export default function Topbar({
  onMenuToggle,
  onLogoClick,
}: {
  onMenuToggle?: () => void
  onLogoClick?: () => void
}) {
  return (
    <header className="sticky top-0 z-50 mb-2 w-full border-b border-soft bg-frost/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-3 sm:px-4">
        {/* Left Section - Menu & Brand */}
        <div className="flex items-center gap-2">
          {/* Menu Toggle Button */}
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={onMenuToggle}
            className="mr-1 grid h-9 w-9 place-items-center rounded-xl border border-soft bg-white shadow-sm"
          >
            <span className="flex flex-col items-center justify-center gap-1">
              <span className="block h-[2px] w-5 bg-gray-800" />
              <span className="block h-[2px] w-5 bg-gray-800" />
              <span className="block h-[2px] w-5 bg-gray-800" />
            </span>
          </button>
          {/* Brand Logo + Name (clickable) */}
          <button
            type="button"
            aria-label="Go to dashboard"
            onClick={onLogoClick}
            className="flex items-center gap-2 focus:outline-none"
            style={{ background: 'none', border: 0, padding: 0 }}
          >
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 overflow-hidden ring-1 ring-brand-200/60">
              <img src="/logo.png" alt="SmartSpend logo" className="h-9 w-9 object-contain" />
            </div>
            <span className="text-lg font-semibold">SmartSpend</span>
          </button>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="grid h-9 w-9 place-items-center rounded-xl border border-soft bg-white shadow-sm hover:bg-brand-100 transition"
          >
            <Bell size={18} className="text-gray-500" />
          </button>
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-soft bg-white shadow-sm hover:bg-brand-100 transition">
            <ProfileMenu />
          </div>
        </div>
      </div>
    </header>
  )
}
