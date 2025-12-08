export default function Chip({
  children, onClose,
}: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-soft bg-white px-2 py-1 text-xs">
      {children}
      {onClose && (
        <button onClick={onClose} className="rounded p-0.5 hover:bg-gray-100">×</button>
      )}
    </span>
  )
}
