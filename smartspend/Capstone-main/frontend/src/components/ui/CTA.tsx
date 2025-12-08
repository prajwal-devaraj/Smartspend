export function PrimaryCTA(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`w-full rounded-2xl bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-600 ${props.className||''}`} />
}
export function GhostCTA(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`w-full rounded-2xl border border-brand-300 bg-white px-4 py-3 font-medium text-brand-600 hover:bg-brand-50 ${props.className||''}`} />
}
export function LinkCTA(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="mx-auto block px-2 py-2 text-center font-medium text-brand-600" />
}
