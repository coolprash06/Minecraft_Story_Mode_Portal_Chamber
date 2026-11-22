import { useEffect, useRef, useState } from 'react'
import { flintById, HOTBAR_SLOTS } from '../config/items'
import { flintIcon } from '../gfx/flintArt'
import { selectSlot } from '../state/game'
import { useApp } from '../state/store'

/** Lighter version of an item colour, readable as text on the dark HUD. */
export function textColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.38)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

/**
 * Pixel-style hotbar: 9 slots along the bottom. Click a slot (or press 1–9) to hold its item; the
 * held slot gets a bright frame. Hovering a filled slot shows its name; selecting one (or an item
 * landing in it) also flashes the name above the bar.
 */
export function Hotbar() {
  const hotbar = useApp((s) => s.hotbar)
  const selected = useApp((s) => s.selected)
  const [hoverSlot, setHoverSlot] = useState(-1)
  const [name, setName] = useState<{ id: string; key: number } | null>(null)
  const prev = useRef(hotbar)

  // flash the name when an item lands or a filled slot is selected
  useEffect(() => {
    const landed = hotbar.findIndex((id, i) => id && !prev.current[i])
    prev.current = hotbar
    if (landed >= 0) setName({ id: hotbar[landed]!, key: Date.now() })
  }, [hotbar])
  useEffect(() => {
    const id = selected >= 0 ? hotbar[selected] : null
    if (id) setName({ id, key: Date.now() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])
  useEffect(() => {
    if (!name) return
    const t = setTimeout(() => setName(null), 2200)
    return () => clearTimeout(t)
  }, [name])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= HOTBAR_SLOTS) selectSlot(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nameDef = flintById(name?.id)
  return (
    <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 sm:bottom-4" style={{ ['--slot' as string]: 'clamp(40px, 3.3vw, 58px)' }}>
      <div
        key={name?.key}
        className={`font-pixel text-[10px] tracking-wider transition-opacity duration-500 sm:text-xs ${nameDef ? 'animate-[hbname_2.2s_ease-out_forwards]' : 'opacity-0'}`}
        style={{ color: nameDef ? textColor(nameDef.color) : undefined, textShadow: '2px 2px 0 #000' }}
      >
        {nameDef?.name ?? ' '}
      </div>
      <div className="pointer-events-auto flex border-[3px] border-[#06060b] bg-[#06060b]/80 shadow-[0_4px_0_rgba(0,0,0,0.35)]" onPointerLeave={() => setHoverSlot(-1)}>
        {Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
          const def = flintById(hotbar[i])
          const isSel = i === selected
          return (
            <button
              key={i}
              type="button"
              data-hotbar-slot={i}
              aria-label={def ? `Slot ${i + 1}: ${def.name}` : `Slot ${i + 1}: empty`}
              aria-pressed={isSel}
              onClick={() => selectSlot(i)}
              onPointerEnter={() => setHoverSlot(i)}
              className="relative grid cursor-pointer place-items-center border-r-[3px] border-[#06060b] bg-[#2b2938]/85 outline-none last:border-r-0 hover:bg-[#3a3750]/90"
              style={{ width: 'var(--slot)', height: 'var(--slot)', boxShadow: 'inset 3px 3px 0 rgba(0,0,0,0.5), inset -3px -3px 0 rgba(255,255,255,0.07)' }}
            >
              <span className="absolute left-1 top-0 font-term text-sm leading-none text-[#e9e6f2]/35">{i + 1}</span>
              {def && (
                <img
                  key={def.id}
                  src={flintIcon(def.color)}
                  alt=""
                  draggable={false}
                  className="w-[72%] animate-[slotpop_420ms_cubic-bezier(.2,1.7,.4,1)]"
                  style={{ imageRendering: 'pixelated', filter: 'drop-shadow(2px 2px 0 rgba(0,0,0,0.55))' }}
                />
              )}
              {isSel && (
                <span
                  className="pointer-events-none absolute -inset-[5px] z-10 border-[4px] border-[#f4f1ff]"
                  style={{ boxShadow: `0 0 0 2px #06060b, inset 0 0 0 2px #06060b, inset 0 0 14px ${def ? def.color + '88' : 'transparent'}` }}
                />
              )}
              {def && hoverSlot === i && (
                <span
                  className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap border-2 bg-[#0d0b16]/95 px-2 py-1 font-pixel text-[10px] tracking-wide"
                  style={{ color: textColor(def.color), borderColor: def.color + 'aa', textShadow: '1px 1px 0 #000' }}
                >
                  {def.name}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
