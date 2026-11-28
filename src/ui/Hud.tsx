import { COARSE_POINTER } from '../lib/device'
import { toggleMode } from '../state/game'
import { BOOT_WORLD, useApp } from '../state/store'
import { Hotbar } from './Hotbar'
import { BENCH_SECONDS, Perf } from './Perf'
import { Prompt, Toasts } from './Prompt'

/** HUD: title, mode badge, controls hint, hover prompt, messages and the hotbar. */
export function Hud() {
  const mode = useApp((s) => s.mode)
  const playing = useApp((s) => s.freeLock) === 'locked'
  const ready = useApp((s) => s.sceneReady)
  // fades away while entering a portal, and back once on the rail again
  const away = useApp((s) => s.journey) !== 'hall'
  return (
    <div className={`pointer-events-none fixed inset-0 z-10 select-none transition-opacity duration-500 ${away ? 'invisible opacity-0' : 'opacity-100'}`} style={{ transitionProperty: 'opacity, visibility' }}>
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-6 sm:top-6">
        <h1 className="font-pixel text-[10px] tracking-[0.2em] text-[#e9e6f2]/80 sm:text-xs" style={{ textShadow: '2px 2px 0 #000' }}>
          THE HALL OF PORTALS
        </h1>
        {COARSE_POINTER ? (
          <span className="w-fit border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a]">GLIDE</span>
        ) : (
          // the mode badge is also the toggle (F does the same)
          <button
            type="button"
            onClick={(e) => {
              // drop focus, so SPACE (jump) / Enter can't press it again
              e.currentTarget.blur()
              toggleMode()
            }}
            onKeyDown={(e) => e.code === 'Space' && e.preventDefault()}
            title={mode === 'glide' ? 'Switch to Free Roam (F)' : 'Switch to Glide (F)'}
            className="pointer-events-auto flex w-fit cursor-pointer items-center gap-2 border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a] outline-none hover:bg-black/65 focus-visible:shadow-[0_0_0_2px_#ffd27a]"
          >
            <span className="border border-[#ffd27a]/50 px-1 text-[8px] text-[#e9e6f2]/80">F</span>
            {mode === 'glide' ? 'GLIDE' : 'FREE ROAM'}
          </button>
        )}
      </div>
      <p
        className="absolute inset-x-0 px-4 text-center font-term text-lg tracking-wider text-[#e9e6f2]/60 sm:text-xl"
        style={{ textShadow: '2px 2px 0 #000', bottom: 'calc(clamp(40px, 3.3vw, 58px) + 46px)' }}
      >
        {mode === 'glide' ? (
          <>
            Scroll · W/S to glide &nbsp;·&nbsp; drag · A/D to look around &nbsp;·&nbsp; click to interact · 1–9 hold
            {!COARSE_POINTER && <> &nbsp;·&nbsp; F free roam</>}
          </>
        ) : (
          <>WASD move · Shift sprint · Space jump &nbsp;·&nbsp; E / click interact · 1–9 hold &nbsp;·&nbsp; F glide · Esc pause</>
        )}
      </p>
      {mode === 'free' && playing && <Crosshair />}
      <Toasts />
      <Hotbar />
      <Prompt />
      {/* ?dim=N into a 3D world: that world runs the bench, not the hall */}
      <Perf ready={ready} canvas="#hall canvas" bench={BOOT_WORLD ? 0 : BENCH_SECONDS} />
    </div>
  )
}

/** Free Roam's crosshair: a small pixel cross, inverted against the scene so it reads anywhere. */
function Crosshair() {
  return (
    <svg viewBox="0 0 9 9" className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2" shapeRendering="crispEdges" aria-hidden style={{ mixBlendMode: 'difference' }}>
      <path d="M4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6z" fill="#f4f1ff" />
    </svg>
  )
}
