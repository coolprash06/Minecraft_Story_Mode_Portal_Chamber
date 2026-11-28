import { lazy, Suspense } from 'react'
import { Experience } from './scene/Experience'
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
      <Journey />
    </div>
  )
}
