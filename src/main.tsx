/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import { NetworkProvider } from './NetworkContext'

import './index.css'

const queryClient = new QueryClient()



createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NetworkProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider
            theme="auto"
            mode="light"
            customTheme={{
              "--ck-font-family": "'Space Grotesk', system-ui, sans-serif",
              "--ck-border-radius": "20px",
              "--ck-overlay-background": "rgba(15,23,42,0.5)",
              "--ck-modal-box-shadow": "0 25px 50px rgba(0,0,0,0.15)",
              "--ck-body-background": "#ffffff",
              "--ck-body-background-secondary": "#f8faff",
              "--ck-body-background-tertiary": "#eff6ff",
              "--ck-body-color": "#0f172a",
              "--ck-body-color-muted": "#64748b",
              "--ck-body-color-muted-hover": "#475569",
              "--ck-primary-button-background": "#1d2f50",
              "--ck-primary-button-hover-background": "#1e3a6e",
              "--ck-primary-button-color": "#ffffff",
              "--ck-primary-button-border-radius": "16px",
              "--ck-secondary-button-background": "#eff6ff",
              "--ck-secondary-button-hover-background": "#dbeafe",
              "--ck-secondary-button-color": "#2563eb",
              "--ck-secondary-button-border-radius": "16px",
              "--ck-focus-color": "#2563eb",
              "--ck-body-divider": "#e2e8f0",
              "--ck-tooltip-background": "#0f172a",
              "--ck-tooltip-color": "#f8fafc",
              "--ck-spinner-color": "#2563eb",
              "--ck-connectbutton-background": "#1d2f50",
              "--ck-connectbutton-hover-background": "#1e3a6e",
              "--ck-connectbutton-color": "#ffffff",
              "--ck-connectbutton-border-radius": "14px",
              "--ck-connectbutton-box-shadow": "0 2px 8px rgba(29,47,80,0.25)",

              /* dropdown / network switcher */
              "--ck-dropdown-background": "#ffffff",
              "--ck-dropdown-box-shadow": "0 8px 32px rgba(0,0,0,0.12)",
              "--ck-dropdown-border-radius": "16px",
              "--ck-dropdown-color": "#0f172a",
              "--ck-network-selector-background": "#ffffff",
              "--ck-network-selector-box-shadow": "0 8px 32px rgba(0,0,0,0.12)",
              "--ck-body-background-transparent": "rgba(255,255,255,0)",

              /* option rows */
              "--ck-body-action-color": "#2563eb",
              "--ck-body-color-danger": "#dc2626",

              /* wallet option buttons */
              "--ck-wallet-option-background": "#f8faff",
              "--ck-wallet-option-background-hover": "#eff6ff",
              "--ck-wallet-option-shadow": "0 2px 8px rgba(0,0,0,0.06)",
              "--ck-wallet-option-border-radius": "14px",

              "--ck-connectbutton-active-background": "#1e3a6e",
              "--ck-connectbutton-balance-color": "#ffffff",
            }}
          >
            <App />
            <Toaster position="top-center" />
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </NetworkProvider>
  </StrictMode>,
)

