import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'

import { ThemeProvider } from './context/ThemeContext'

import ErrorBoundary from './components/common/ErrorBoundary'

// Handle dynamic import failures when a new frontend build is deployed
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'vite_preload_reload_time';
  const lastReload = parseInt(sessionStorage.getItem(reloadKey) || '0', 10);
  const now = Date.now();
  // Throttle reload to prevent infinite loops (at most once every 10 seconds)
  if (now - lastReload > 10000) {
    sessionStorage.setItem(reloadKey, String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
)

