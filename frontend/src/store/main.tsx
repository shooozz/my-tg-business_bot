import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { initTheme } from '../shared/theme'
import { App } from './App'

initTheme()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
