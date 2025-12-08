import { NavLink } from 'react-router-dom'
import {
  Home,
  List,
  CreditCard,
  BarChart2,
  Target,
  Award, // Use this as Accumulates icon
} from 'lucide-react'

export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/transactions', icon: List, label: 'Transactions' },
    { to: '/bills', icon: CreditCard, label: 'Bills' },
    { to: '/insights', icon: BarChart2, label: 'Insights' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/accumulates', icon: Award, label: 'Accumulates' }, // New item below Goals
  ]

  return (
    <nav className="space-y-1">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150',
              'hover:bg-white hover:shadow-sm',
              isActive
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-700 hover:text-gray-900',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={18}
                className={isActive ? 'text-brand-500' : 'text-gray-500'}
              />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
