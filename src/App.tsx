import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { worldFor } from './config/dimensions'
import { Experience } from './scene/Experience'
import { appStore, useApp } from './state/store'
import { loadShip, prefetchWorlds, reportWorldLoad, resetWorldLoad, worldLoad } from './state/world'
import { Hud } from './ui/Hud'
import { Journey } from './ui/Journey'
import { Loader } from './ui/Loader'
import { PauseMenu } from './ui/PauseMenu'

/** ?showcase=pirates: the Mission 1 crew viewer. Its own lazy chunk; the hall never loads it. */
const SHOWCASE = new URLSearchParams(window.location.search).get('showcase')
const PirateShowcase = lazy(() => import('./showcase/PirateShowcase'))

export default function App() {
  if (SHOWCASE === 'pirates')
    return (
      <Suspense fallback={null}>
        <PirateShowcase />
      </Suspense>
    )
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05060c]">
      <Experience />
      <Hud />
      <PauseMenu />
      <Loader />
      <WorldHost />
      <Journey />
    </div>
  )
}

/**
 * Mounts a portal's 3D world (its own lazy chunk) from the start of the warp, which is also its
 * loading screen, until the player leaves; it unmounts behind the warp home, freeing its GPU state.
 * Also prefetches the world chunks once the hall is ready.
 */
function WorldHost() {
  const journey = useApp((s) => s.journey)
  const portal = useApp((s) => s.journeyPortal)
  const ready = useApp((s) => s.sceneReady)
  const want = portal >= 0 && worldFor(portal) === 'ship' && (journey === 'warp' || journey === 'world')
  const [Ship, setShip] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (ready) prefetchWorlds()
  }, [ready])

  useEffect(() => {
    if (!want) return
    resetWorldLoad()
    reportWorldLoad(0.05, 'Charting the waters…')
    let dead = false
    loadShip().then(
      (m) => {
        if (dead) return
        reportWorldLoad(0.2)
        setShip(() => m.default)
      },
      () => {
        if (!dead && appStore.get().journey === 'warp') worldLoad.failed = true
      },
    )
    return () => {
      dead = true
    }
  }, [want])

  return want && Ship ? <Ship /> : null
}
