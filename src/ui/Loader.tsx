import { useEffect, useState } from 'react'
import { useApp } from '../state/store'

/** Minimal loading veil until shaders are compiled (phase 8 turns this into the full intro). */
export function Loader() {
  const ready = useApp((s) => s.sceneReady)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setGone(true), 900)
    return () => clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#05060c] transition-opacity duration-700 ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <p className="animate-pulse font-pixel text-[10px] tracking-[0.3em] text-[#e9e6f2]/70 sm:text-xs">LIGHTING THE HALL…</p>
    </div>
  )
}
