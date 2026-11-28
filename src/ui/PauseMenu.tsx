/**
 * Free Roam's pause menu: shows whenever Free Roam is on in the hall without the pointer lock
 * (Esc released it, a dimension return via Esc, or ?mode=free before the first click).
 * Resume · Controls · Switch to Glide · Return to Entrance. Browsers only grant the lock from a
 * click or key press (never Esc), and refuse it for ~1 s after Esc: then it says so and Resume
 * simply works on the next try.
 */
import { useEffect, useRef, useState } from 'react'
import { requestFreeLock, returnToEntrance, setMode } from '../state/game'
import { useApp } from '../state/store'

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move (where you look)'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump · jump into a lit portal to enter'],
  ['E / Click', 'Interact (take, return, light)'],
  ['1 – 9', 'Hold a hotbar item'],
  ['F', 'Switch to Glide'],
  ['Esc', 'Pause'],
]

export function PauseMenu() {
  const mode = useApp((s) => s.mode)
  const lock = useApp((s) => s.freeLock)
  const journey = useApp((s) => s.journey)
  const ready = useApp((s) => s.sceneReady)
  const [panel, setPanel] = useState<'menu' | 'controls'>('menu')
  const [fade, setFade] = useState(false)
  const started = useRef(false)
  if (lock === 'locked') started.current = true

  const open = mode === 'free' && journey === 'hall' && ready && (lock === 'released' || lock === 'refused')

  useEffect(() => {
    if (!open) setPanel('menu')
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel('menu')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toEntrance = () => {
    // the click is the gesture that re-locks; the fade hides the jump
    requestFreeLock()
    setFade(true)
    setTimeout(() => {
      returnToEntrance()
      setFade(false)
    }, 260)
  }

  return (
    <>
      <div aria-hidden className={`pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-[250ms] ${fade ? 'opacity-100' : 'opacity-0'}`} />
      {open && (
        <div className="fixed inset-0 z-30 grid select-none place-items-center bg-[#05060c]/60 backdrop-blur-[2px]" role="dialog" aria-modal aria-label="Paused">
          <div className="flex w-[min(92vw,440px)] flex-col items-center gap-3">
            <h2 className="mb-2 font-pixel text-sm tracking-[0.25em] text-[#e9e6f2] sm:text-base" style={{ textShadow: '3px 3px 0 #000' }}>
              {started.current ? 'PAUSED' : 'FREE ROAM'}
            </h2>
            {panel === 'menu' ? (
              <>
                <MenuButton autoFocus onClick={requestFreeLock}>
                  {started.current ? 'Resume' : 'Click to play'}
                </MenuButton>
                <MenuButton onClick={() => setPanel('controls')}>Controls</MenuButton>
                <MenuButton onClick={() => setMode('glide')}>Switch to Glide</MenuButton>
                <MenuButton onClick={toEntrance}>Return to Entrance</MenuButton>
                <p className="mt-1 h-6 font-term text-lg text-[#c9cdf0]/70" style={{ textShadow: '2px 2px 0 #000' }}>
                  {lock === 'refused' ? 'One moment… then Resume again' : ''}
                </p>
              </>
            ) : (
              <>
                <dl className="grid w-full grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-[3px] border-[#06060b] bg-[#0d0b16]/90 px-5 py-4 font-term text-xl text-[#e9e6f2]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                  {CONTROLS.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[#ffd27a]">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <MenuButton autoFocus onClick={() => setPanel('menu')}>
                  Back
                </MenuButton>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function MenuButton({ children, onClick, autoFocus }: { children: React.ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      // SPACE / Enter on a focused button would also fire it; keep SPACE for jumping
      onKeyDown={(e) => e.code === 'Space' && e.preventDefault()}
      className="w-full cursor-pointer border-[3px] border-[#06060b] bg-[#2b2938]/90 px-5 py-3 font-pixel text-[10px] tracking-wider text-[#eef1ff] outline-none transition-[background,box-shadow] duration-150 hover:bg-[#3a3750] focus-visible:shadow-[0_0_0_2px_#ffd27a] sm:text-xs"
      style={{ boxShadow: 'inset 3px 3px 0 rgba(255,255,255,0.08), inset -3px -3px 0 rgba(0,0,0,0.45)' }}
    >
      {children}
    </button>
  )
}
