import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { WalletSessionProvider } from './wallet'
import './style.css'
import './redesign.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><WalletSessionProvider><App /></WalletSessionProvider></React.StrictMode>,
)
