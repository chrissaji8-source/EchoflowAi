import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CurtainProvider } from './components/Curtain'
import { SiteLayout } from './components/Shell'
import Assistant from './pages/Assistant'
import Help from './pages/Help'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import NotFound from './pages/NotFound'
import Playbook from './pages/Playbook'
import Privacy from './pages/Privacy'
import Threats from './pages/Threats'
import { EchoFlowVoiceProvider } from './voice/echoflow'

// The demo film is rendered from this route (see scripts/render-film.mjs). Dev only, so it never ships.
const Film = import.meta.env.DEV ? lazy(() => import('./film/Film')) : null

const TITLES: Record<string, string> = {
  '/': 'EchoFlow — Voice assistant demo',
  '/how-it-works': 'How it works — EchoFlow',
  '/threats': 'Turn taking — EchoFlow',
  '/playbook': 'Diagnostics and limits — EchoFlow',
  '/privacy': 'Architecture and data — EchoFlow',
  '/help': 'Help — EchoFlow',
  '/assistant': 'Voice assistant — EchoFlow',
}

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = TITLES[pathname] ?? 'Page not found — Cadence'
  }, [pathname])
  return null
}

/*
 * INTEGRATION POINT
 * The voice assistant page connects to the EchoFlow FastAPI WebSocket demo.
 */
export default function App() {
  return (
    <BrowserRouter>
      <CurtainProvider>
        <TitleManager />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="threats" element={<Threats />} />
            <Route path="playbook" element={<Playbook />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="help" element={<Help />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          {Film && (
            <Route
              path="__film"
              element={
                <Suspense fallback={null}>
                  <Film />
                </Suspense>
              }
            />
          )}
          <Route
            path="assistant"
            element={
              <EchoFlowVoiceProvider>
                <Assistant />
              </EchoFlowVoiceProvider>
            }
          />
        </Routes>
      </CurtainProvider>
    </BrowserRouter>
  )
}
