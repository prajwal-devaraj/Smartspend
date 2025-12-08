type P = { value: number; min?: number; max?: number; onChange:(v:number)=>void }
export default function Slider({ value, min=15, max=90, onChange }: P) {
  return (
    <input
      type="range"
      min={min} max={max} value={value}
      onChange={(e)=>onChange(Number(e.target.value))}
      className="w-full accent-brand-500"
    />
  )
}
