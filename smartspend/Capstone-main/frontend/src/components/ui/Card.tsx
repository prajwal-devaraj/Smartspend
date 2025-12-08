import { PropsWithChildren } from 'react'
export function Card({ children, className='' }: PropsWithChildren<{className?: string}>) {
  return <div className={`card p-4 ${className}`}>{children}</div>
}
export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-lg font-semibold">{children}</h3>
      {right}
    </div>
  )
}
