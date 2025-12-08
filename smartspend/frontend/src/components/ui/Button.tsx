import { ButtonHTMLAttributes } from 'react'
type P = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }

export default function Button({ variant='primary', disabled, className='', ...props }: P) {
  const base = 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-300 disabled:opacity-60 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-brand-500 text-white hover:bg-brand-600'
      : 'border border-soft bg-white text-brand-700 hover:bg-brand-50'
  return <button className={`${base} ${styles} ${className}`} disabled={disabled} {...props} />
}
