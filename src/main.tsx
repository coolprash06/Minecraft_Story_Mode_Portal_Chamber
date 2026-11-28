import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/press-start-2p/400.css'
import '@fontsource/vt323/400.css'
import './index.css'
// patches three's point-shadow filter before any shader compiles
import './gfx/shadowFilter'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
