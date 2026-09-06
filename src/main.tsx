import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DevOtdrPreview } from './ui/dev/DevOtdrPreview.tsx'

// Temporary dev-only gate for eyeballing the OTDR module (build item 2) before item 6
// builds the real app shell and routing. Visit /?dev=otdr to see it.
const isDevOtdrPreview = new URLSearchParams(window.location.search).get('dev') === 'otdr'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDevOtdrPreview ? <DevOtdrPreview /> : <App />}
  </StrictMode>,
)
