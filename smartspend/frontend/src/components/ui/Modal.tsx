// src/components/ui/Modal.tsx
import { PropsWithChildren, useEffect } from 'react'

type ModalProps = PropsWithChildren<{
  open: boolean
  onClose: () => void
  title?: string
  maxWidth?: string
}>

export default function Modal({ open, onClose, title, maxWidth = 'max-w-lg', children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} rounded-2xl border border-soft bg-white p-4 shadow-2xl sm:p-6`}>
        {title && <h3 className="mb-3 text-lg font-semibold">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
