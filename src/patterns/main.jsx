import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './patterns.css'
import PatternsPage from './PatternsPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PatternsPage />
  </StrictMode>,
)
