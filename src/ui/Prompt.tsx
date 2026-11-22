import { useEffect, useRef, useState } from 'react'
import { flintById } from '../config/items'
import { pointer } from '../controls/Interaction'
import { heldFlint } from '../state/game'
import { isLit, useApp } from '../state/store'
import { textColor } from './Hotbar'

/** The hover prompt, following the cursor (Free Roam will pin it under the crosshair). */
export function Prompt() {
  const hover = useApp((s) => s.hover)
  const litMask = useApp((s) => s.litMask)
  // re-read the held flint when the selection changes
  useApp((s) => s.selected)
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const place = () => {
      raf = 0
      if (el.current) el.current.style.transform = `translate3d(${pointer.clientX + 18}px, ${pointer.clientY + 20}px, 0)`
    }
    const onMove = () => (raf ||= requestAnimationFrame(place))
    place()
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  let body: React.ReactNode = null
  if (hover?.kind === 'frame') {
    const def = flintById(hover.flintId)
    body = (
      <>
        Click to take <span style={{ color: def ? textColor(def.color) : undefined }}>{def?.name}</span>
      </>
    )
  } else if (hover?.kind === 'portal') {
    body = isLit(litMask, hover.portalId) ? 'Coming soon' : heldFlint() ? 'Click to light' : 'Unlit portal'
  }

  return (
    <div ref={el} className="absolute left-0 top-0 will-change-transform">
      <div
        className={`whitespace-nowrap border-2 border-[#06060b] bg-[#0d0b16]/85 px-2 py-1 font-term text-xl leading-none tracking-wide text-[#e9e6f2] transition-opacity duration-150 ${body ? 'opacity-100' : 'opacity-0'}`}
        style={{ textShadow: '2px 2px 0 #000', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
      >
        {body ?? ' '}
      </div>
    </div>
  )
}

/** Short messages above the hotbar ("You need a flint and steel", …). */
export function Toasts() {
  const toast = useApp((s) => s.toast)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!toast) return
    setShown(true)
    const t = setTimeout(() => setShown(false), 2200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div className="absolute inset-x-0 flex justify-center px-4" style={{ bottom: 'calc(clamp(40px, 3.3vw, 58px) + 92px)' }}>
      <p
        key={toast?.key}
        className={`font-pixel text-[10px] tracking-wider transition-all duration-300 sm:text-xs ${shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'} ${toast?.tone === 'warn' ? 'text-[#ffb08a]' : 'text-[#e9e6f2]'} ${shown ? 'animate-[toastin_260ms_ease-out]' : ''}`}
        style={{ textShadow: '2px 2px 0 #000' }}
      >
        {toast?.text ?? ' '}
      </p>
    </div>
  )
}
