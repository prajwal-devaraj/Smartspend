import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Topbar from '@/components/layout/Topbar'
import SidebarNav from '@/components/layout/SidebarNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isDashboard = location.pathname === '/dashboard'

  // Show sidebar if on dashboard or toggled open elsewhere
  const showSidebar = isDashboard || sidebarOpen

  // Auto-close sidebar when navigating away from dashboard
  useEffect(() => {
    if (!isDashboard) setSidebarOpen(false)
  }, [isDashboard])

  // Always go to dashboard when brand clicked, unless already there
  const handleLogoClick = () => {
    if (!isDashboard) navigate('/dashboard')
  }

  return (
    <div className="min-h-screen w-full bg-cream">
      <Topbar
        onMenuToggle={() => setSidebarOpen(v => !v)}
        onLogoClick={handleLogoClick}
      />
      <div className="mx-auto flex max-w-[1440px] w-full pt-2 relative">
        {showSidebar && (
          <aside className="sticky left-0 top-2 z-20 flex h-[calc(100vh-1rem)] w-[220px] flex-col gap-1 rounded-2xl bg-cream px-1 py-4 shadow-card transition-all">
            <SidebarNav onNavigate={() => setSidebarOpen(false)} />
          </aside>
        )}
        <main className={`flex-1 min-w-0 px-2 py-3 ${showSidebar ? 'ml-0' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  )
}
