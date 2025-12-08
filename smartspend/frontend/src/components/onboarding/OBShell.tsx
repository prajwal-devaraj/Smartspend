import { PropsWithChildren } from 'react'

export default function OBShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-cream bg-gradient-to-b from-[#fffaf8] to-[#fffefd] flex items-center justify-center px-4 py-10">
      {/* Reduced width for vertical focus */}
      <div className="w-full max-w-md min-h-[460px] rounded-[24px] border border-soft bg-white p-8 shadow-lg md:p-10 animate-[fadeIn_250ms_ease-out]">
        {children}
      </div>
    </div>
  )
}
