import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LexiCard from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LexiCard />
  </StrictMode>,
)