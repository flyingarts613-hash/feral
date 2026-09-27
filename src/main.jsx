import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/anton/latin-400.css'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/cormorant-garamond/latin-500-italic.css'
import 'lenis/dist/lenis.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
