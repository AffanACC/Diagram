import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Some places that display an HTML file (SharePoint, mail and chat viewers) forbid inline <style>
// elements. Without them the page would be unstyled and the arrows invisible. If our styles did
// not apply, load the same CSS as a constructed stylesheet, which such rules do not block.
function ensureStyles() {
  if (getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()) return
  try {
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  } catch {
    /* nothing more can be done; the page stays unstyled */
  }
}
ensureStyles()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
