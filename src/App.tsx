import { Experience } from './scene/Experience'
import { Hud } from './ui/Hud'
import { Loader } from './ui/Loader'

export default function App() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05060c]">
      <Experience />
      <Hud />
      <Loader />
    </div>
  )
}
