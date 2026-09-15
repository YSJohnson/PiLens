import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import './styles.css'

try {
  const saved = JSON.parse(window.localStorage.getItem('pi-desktop:ui-preferences') ?? '{}') as { state?: { themePreference?: string } }
  const preference = saved.state?.themePreference ?? 'dark'
  document.documentElement.dataset.theme = preference === 'system'
    ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    : preference === 'light' ? 'light' : 'dark'
} catch {
  document.documentElement.dataset.theme = 'dark'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
