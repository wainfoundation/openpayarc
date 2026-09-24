# Connect Wallet — Full Integration Guide

**Stack:** wagmi v2 · ConnectKit v1 · viem v2 · React 18 · Vite  
**Supports:** Browser extensions (MetaMask, OKX, Phantom, Brave) · WalletConnect v2 (mobile QR/deep-link) · Coinbase Wallet  
**Chains:** Arc Testnet · Arc Mainnet · Ethereum Mainnet (ENS)

---

## 1. Install dependencies

```bash
npm install wagmi viem connectkit @tanstack/react-query
# or
bun add wagmi viem connectkit @tanstack/react-query
```

**Exact versions used in this project:**
```json
"wagmi":              "^2.19.5",
"viem":               "^2.56.3",
"connectkit":         "^1.9.2",
"@tanstack/react-query": "^5.62.7"
```

---

## 2. Environment variables

Create a `.env` file in your project root:

```env
# WalletConnect Project ID — free at https://cloud.walletconnect.com
# Create a project, add your domain as an allowed origin.
# The fallback below is a public demo ID (lower rate limits).
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

> **For production:** always use your own Project ID. Register your app domain
> in the WalletConnect Cloud dashboard under **Allowed Domains**.

---

## 3. wagmi config (`src/config.ts`)

```ts
import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'          // Arc chains
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

// WalletConnect Project ID
const WC_PROJECT_ID: string =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)
  ?? '2f05ae7f1116030fde2d36508f472bfb'   // public demo fallback

export const config = createConfig({
  chains: [arcTestnet, arc, mainnet],     // add/remove chains as needed

  connectors: [
    // ① Browser extension — MetaMask, OKX, Phantom, Brave, etc.
    injected({ shimDisconnect: true }),

    // ② WalletConnect v2 — QR code on desktop, deep-link on mobile
    //    Works in any external browser (Safari, Chrome, Telegram, etc.)
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name:        'Your App Name',
        description: 'Your app description',
        url:         'https://your-app.com',
        icons:       ['https://your-app.com/icon-192.png'],
      },
      showQrModal: true,
    }),

    // ③ Coinbase Wallet — desktop + mobile deep-link
    coinbaseWallet({
      appName:    'Your App Name',
      appLogoUrl: 'https://your-app.com/icon-192.png',
    }),
  ],

  transports: {
    [arcTestnet.id]: http(),                          // Arc Testnet default RPC
    [arc.id]:        http('https://rpc.mainnet.arc.io'), // Arc Mainnet
    [mainnet.id]:    http(),                          // Ethereum (ENS only)
  },
})
```

**To use Ethereum / Base / Arbitrum instead of Arc:**
```ts
import { mainnet, base, arbitrum } from 'wagmi/chains'

export const config = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [ injected({ shimDisconnect: true }), walletConnect({ ... }), coinbaseWallet({ ... }) ],
  transports: {
    [mainnet.id]:  http(),
    [base.id]:     http(),
    [arbitrum.id]: http(),
  },
})
```

---

## 4. Provider tree (`src/main.tsx`)

Wrap your app with all required providers **in this exact order**:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'            // optional — for toast notifications
import { config } from './config'
import App from './App'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          mode="light"
          customTheme={connectKitTheme}    // see Section 5
        >
          <App />
          <Toaster position="top-center" />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
)
```

**Provider order matters:**
- `WagmiProvider` must wrap `QueryClientProvider`
- `ConnectKitProvider` must be inside both
- `QueryClient` instance must be created **outside** the render function

---

## 5. ConnectKit white/light theme

Copy this `customTheme` object into your `ConnectKitProvider` to get a clean white iOS-style modal that matches the OpenPay Arc design:

```ts
const connectKitTheme = {
  "--ck-font-family":                    "'Space Grotesk', system-ui, sans-serif",
  "--ck-border-radius":                  "20px",
  "--ck-overlay-background":             "rgba(15,23,42,0.5)",
  "--ck-modal-box-shadow":               "0 25px 50px rgba(0,0,0,0.15)",

  // Modal background
  "--ck-body-background":                "#ffffff",
  "--ck-body-background-secondary":      "#f8faff",
  "--ck-body-background-tertiary":       "#eff6ff",

  // Text
  "--ck-body-color":                     "#0f172a",
  "--ck-body-color-muted":               "#64748b",
  "--ck-body-color-muted-hover":         "#475569",
  "--ck-body-action-color":              "#2563eb",
  "--ck-body-color-danger":              "#dc2626",
  "--ck-body-divider":                   "#e2e8f0",

  // Primary button (inside modal)
  "--ck-primary-button-background":      "#1d2f50",
  "--ck-primary-button-hover-background":"#1e3a6e",
  "--ck-primary-button-color":           "#ffffff",
  "--ck-primary-button-border-radius":   "16px",

  // Secondary button
  "--ck-secondary-button-background":    "#eff6ff",
  "--ck-secondary-button-hover-background":"#dbeafe",
  "--ck-secondary-button-color":         "#2563eb",
  "--ck-secondary-button-border-radius": "16px",

  // Wallet option rows
  "--ck-wallet-option-background":       "#f8faff",
  "--ck-wallet-option-background-hover": "#eff6ff",
  "--ck-wallet-option-shadow":           "0 2px 8px rgba(0,0,0,0.06)",
  "--ck-wallet-option-border-radius":    "14px",

  // Dropdown / network switcher
  "--ck-dropdown-background":            "#ffffff",
  "--ck-dropdown-box-shadow":            "0 8px 32px rgba(0,0,0,0.12)",
  "--ck-dropdown-border-radius":         "16px",
  "--ck-dropdown-color":                 "#0f172a",
  "--ck-network-selector-background":    "#ffffff",
  "--ck-network-selector-box-shadow":    "0 8px 32px rgba(0,0,0,0.12)",
  "--ck-body-background-transparent":    "rgba(255,255,255,0)",

  // Connect button (shown in your header)
  "--ck-connectbutton-background":       "#1d2f50",
  "--ck-connectbutton-hover-background": "#1e3a6e",
  "--ck-connectbutton-active-background":"#1e3a6e",
  "--ck-connectbutton-color":            "#ffffff",
  "--ck-connectbutton-balance-color":    "#ffffff",
  "--ck-connectbutton-border-radius":    "14px",
  "--ck-connectbutton-box-shadow":       "0 2px 8px rgba(29,47,80,0.25)",

  // Misc
  "--ck-focus-color":                    "#2563eb",
  "--ck-tooltip-background":             "#0f172a",
  "--ck-tooltip-color":                  "#f8fafc",
  "--ck-spinner-color":                  "#2563eb",
}
```

To use a **dark theme** instead, set `mode="dark"` and swap the backgrounds:
```ts
"--ck-body-background":           "#0f172a",
"--ck-body-background-secondary": "#1e293b",
"--ck-body-color":                "#f8fafc",
```

---

## 6. The Connect button

Drop this anywhere in your UI:

```tsx
import { ConnectKitButton } from 'connectkit'

export default function Header() {
  return (
    <header>
      <ConnectKitButton />
    </header>
  )
}
```

**Custom trigger** — use your own button:
```tsx
import { ConnectKitButton } from 'connectkit'

<ConnectKitButton.Custom>
  {({ isConnected, show, truncatedAddress, ensName }) => (
    <button onClick={show}>
      {isConnected ? (ensName ?? truncatedAddress) : 'Connect Wallet'}
    </button>
  )}
</ConnectKitButton.Custom>
```

---

## 7. Reading wallet state in components

```tsx
import { useAccount, useBalance, useChainId } from 'wagmi'

export default function WalletInfo() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: balance } = useBalance({ address, token: USDC_ADDRESS })

  if (!isConnected) return <p>Not connected</p>

  return (
    <div>
      <p>Address: {address}</p>
      <p>Chain: {chainId}</p>
      <p>Balance: {balance?.formatted} {balance?.symbol}</p>
    </div>
  )
}
```

---

## 8. Switching chains programmatically

```tsx
import { useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'

export default function ChainSwitcher() {
  const { switchChain } = useSwitchChain()

  return (
    <button onClick={() => switchChain({ chainId: arcTestnet.id })}>
      Switch to Arc Testnet
    </button>
  )
}
```

---

## 9. Sending a USDC transfer

```tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' // Arc Testnet
const USDC_DECIMALS = 6

export default function SendUSDC() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash })

  const send = () => writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [
      '0xRecipientAddress',
      parseUnits('1.00', USDC_DECIMALS),  // send 1.00 USDC
    ],
  })

  return (
    <button onClick={send} disabled={isPending}>
      {isPending ? 'Waiting…' : 'Send 1 USDC'}
    </button>
  )
}
```

---

## 10. Mobile wallet support checklist

| Scenario | Solution |
|----------|----------|
| Desktop browser (Chrome/Firefox) | `injected()` detects MetaMask/OKX extension |
| Mobile — wallet's own in-app browser | `injected()` detects the injected provider |
| Mobile — external browser (Safari, Chrome, Telegram) | **WalletConnect** shows QR/deep-link |
| Coinbase users on any device | `coinbaseWallet()` connector |
| No wallet installed | ConnectKit's "Get a Wallet" flow |

**Critical for mobile:** Without `walletConnect()`, users on external mobile browsers
see only "Browser Wallet" (which finds nothing). WalletConnect v2 deep-links
directly into the installed wallet app — no browser extension needed.

---

## 11. WalletConnect Project setup

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create a new project → copy the **Project ID**
3. Under **Allowed Domains**, add:
   - `localhost` (for development)
   - your production domain (e.g. `your-app.netlify.app`)
4. Set `VITE_WALLETCONNECT_PROJECT_ID=your_id` in `.env`

---

## 12. Arc chain IDs & USDC addresses

| Network | Chain ID | USDC address |
|---------|----------|-------------|
| Arc Testnet | `5042002` | `0x3600000000000000000000000000000000000000` |
| Arc Mainnet | `5042` | `0x3600000000000000000000000000000000000000` |
| Ethereum Sepolia | `11155111` | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `84532` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Arc RPC endpoints:
- Testnet: `https://rpc.testnet.arc.io`
- Mainnet: `https://rpc.mainnet.arc.io`

---

## 13. Vite config (Node polyfills required)

WalletConnect and viem require Node.js globals in the browser. Add the polyfills plugin:

```bash
npm install -D vite-plugin-node-polyfills
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),   // required for WalletConnect + viem
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
```

---

## 14. TypeScript tsconfig

Minimum required settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

---

## 15. Full working example (minimal app)

```tsx
// src/App.tsx
import { ConnectKitButton } from 'connectkit'
import { useAccount, useBalance } from 'wagmi'

const USDC = '0x3600000000000000000000000000000000000000'

export default function App() {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({ address, token: USDC })

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <ConnectKitButton />
      {isConnected && (
        <div style={{ marginTop: 16 }}>
          <p><b>Address:</b> {address}</p>
          <p><b>USDC Balance:</b> {balance?.formatted ?? '…'}</p>
        </div>
      )}
    </div>
  )
}
```

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { config } from './config'    // from Section 3
import App from './App'

createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={new QueryClient()}>
      <ConnectKitProvider>
        <App />
      </ConnectKitProvider>
    </QueryClientProvider>
  </WagmiProvider>
)
```

---

*Generated from the OpenPay Arc project — https://openpayarc.netlify.app*
