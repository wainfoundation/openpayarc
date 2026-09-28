# OpenPay Arc — Wallet Connection Integration Reference

## Overview

OpenPay Arc uses **wagmi v2** + **ConnectKit** for wallet connection. Three connectors are registered, giving users access to 550+ wallets across every platform.

---

## Connector Stack

| # | Connector | What it covers |
|---|---|---|
| 1 | `injected` | MetaMask extension, OKX extension, Phantom extension, Brave Wallet, any EIP-1193 window.ethereum provider |
| 2 | `walletConnect` v2 | MetaMask Mobile, Trust Wallet, OKX Mobile, Phantom Mobile, Rabby Mobile, Ledger Live, 550+ others via QR code on desktop or deep-link on mobile |
| 3 | `coinbaseWallet` | Coinbase Wallet (mobile + desktop), Smart Wallet |

---

## Supported Chains (registered in wagmi config)

| Chain | Chain ID | Type |
|---|---|---|
| Arc Testnet | `5042002` | Primary (testnet) |
| Arc Mainnet | `5042` | Primary (mainnet) |
| Ethereum | `1` | Bridge source |
| Base | `8453` | Bridge source |
| Arbitrum One | `42161` | Bridge source |
| Polygon | `137` | Bridge source |
| Ethereum Sepolia | `11155111` | Bridge source (testnet) |
| Base Sepolia | `84532` | Bridge source (testnet) |
| Arbitrum Sepolia | `421614` | Bridge source (testnet) |
| Polygon Amoy | `80002` | Bridge source (testnet) |

---

## Environment Variables Required

```env
# .env
VITE_WALLETCONNECT_PROJECT_ID=<your-project-id>
```

Get a free project ID at: https://cloud.walletconnect.com  
Add `openpayarc.netlify.app` as an allowed domain in the WalletConnect dashboard.

---

## Installation

```bash
bun add wagmi viem @tanstack/react-query connectkit
```

Or with npm:
```bash
npm install wagmi viem @tanstack/react-query connectkit
```

---

## Config (`src/config.ts`)

```typescript
import { http, createConfig } from 'wagmi'
import { mainnet, base, arbitrum, polygon, sepolia, baseSepolia, arbitrumSepolia, polygonAmoy } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'YOUR_PROJECT_ID'

export const config = createConfig({
  chains: [
    arcTestnet, arc,
    mainnet, base, arbitrum, polygon,
    sepolia, baseSepolia, arbitrumSepolia, polygonAmoy,
  ],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: 'OpenPay Arc',
        description: 'USDC Wallet powered by Circle · Arc',
        url: 'https://openpayarc.netlify.app',
        icons: ['https://openpayarc.netlify.app/icon-192.png'],
      },
      showQrModal: true,
    }),
    coinbaseWallet({
      appName: 'OpenPay Arc',
      appLogoUrl: 'https://openpayarc.netlify.app/icon-192.png',
    }),
  ],
  transports: {
    [arcTestnet.id]:      http(),
    [arc.id]:             http('https://rpc.mainnet.arc.io'),
    [mainnet.id]:         http(),
    [base.id]:            http(),
    [arbitrum.id]:        http(),
    [polygon.id]:         http(),
    [sepolia.id]:         http(),
    [baseSepolia.id]:     http(),
    [arbitrumSepolia.id]: http(),
    [polygonAmoy.id]:     http(),
  },
})
```

---

## Providers (`src/main.tsx`)

```tsx
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { BrowserRouter } from 'react-router-dom'
import { config } from './config'

const queryClient = new QueryClient()

export default function Root() {
  return (
    <BrowserRouter>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider theme="auto" mode="light">
            <App />
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </BrowserRouter>
  )
}
```

---

## Auto-Close Modal on Connect

ConnectKit does not close automatically on mobile WalletConnect deep-link. This component closes it:

```tsx
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useModal } from 'connectkit'

function AutoCloseOnConnect() {
  const { isConnected } = useAccount()
  const { setOpen } = useModal()
  useEffect(() => {
    if (isConnected) setOpen(false)
  }, [isConnected, setOpen])
  return null
}
```

Place `<AutoCloseOnConnect />` inside `<ConnectKitProvider>`.

---

## Connect Button

```tsx
import { ConnectKitButton } from 'connectkit'

// Default ConnectKit button
<ConnectKitButton />

// Custom button
<ConnectKitButton.Custom>
  {({ isConnected, address, show, truncatedAddress, ensName }) => (
    <button onClick={show}>
      {isConnected ? (ensName ?? truncatedAddress) : 'Connect Wallet'}
    </button>
  )}
</ConnectKitButton.Custom>
```

---

## Reading Wallet State (wagmi hooks)

```typescript
import { useAccount, useChainId, useBalance } from 'wagmi'

// Connected address + connection status
const { address, isConnected, status } = useAccount()

// Current chain ID
const chainId = useChainId()  // 5042002 (testnet) or 5042 (mainnet)

// Native USDC balance on Arc
const { data: balance } = useBalance({ address })
// balance.value  → bigint (18 decimals on Arc native)
// balance.symbol → 'USDC'

// ERC-20 USDC balance
import { useReadContract } from 'wagmi'
const USDC = '0x3600000000000000000000000000000000000000'
const { data: usdcBalance } = useReadContract({
  address: USDC,
  abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
  functionName: 'balanceOf',
  args: [address],
})
// usdcBalance → bigint (6 decimals)
// display: (Number(usdcBalance) / 1e6).toFixed(2)
```

---

## Sending a USDC Transaction

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'

const USDC_ABI = [{
  name: 'transfer',
  type: 'function',
  inputs: [
    { name: 'to',    type: 'address' },
    { name: 'value', type: 'uint256' },
  ],
  outputs: [{ type: 'bool' }],
}]

function SendUSDC() {
  const { writeContract, data: hash } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash })

  const send = () => writeContract({
    address: '0x3600000000000000000000000000000000000000',
    abi: USDC_ABI,
    functionName: 'transfer',
    args: ['0xRecipientAddress', parseUnits('1.00', 6)], // 1.00 USDC
  })

  return <button onClick={send}>{isSuccess ? 'Sent!' : 'Send 1 USDC'}</button>
}
```

---

## Switching to Arc Testnet

```typescript
import { useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'

const { switchChain } = useSwitchChain()
switchChain({ chainId: arcTestnet.id }) // 5042002
```

---

## USDC Addresses

| Network | Chain ID | USDC Address | Decimals |
|---|---|---|---|
| Arc Testnet | `5042002` | `0x3600000000000000000000000000000000000000` | 6 |
| Arc Mainnet | `5042` | `0x3600000000000000000000000000000000000000` | 6 |
| Ethereum | `1` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| Base | `8453` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| Arbitrum One | `42161` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 |
| Polygon | `137` | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 6 |

---

## Platform Fee

All transactions in OpenPay Arc include a 1% platform fee (min $0.01, max $5.00 USDC) routed to:

```
0x9853332ecae783514af8d39854f4a1762e152dc9
```

Fee calculation:
```typescript
const FEE_BPS = 100       // 1%
const FEE_MIN = 10_000n   // $0.01 USDC (6 decimals)
const FEE_MAX = 5_000_000n // $5.00 USDC (6 decimals)

function computeFee(amount: bigint): bigint {
  let fee = (amount * BigInt(FEE_BPS)) / 10_000n
  if (fee < FEE_MIN) fee = FEE_MIN
  if (fee > FEE_MAX) fee = FEE_MAX
  return fee
}
```

---

## ConnectKit Custom Theme (OpenPay Arc)

```typescript
const customTheme = {
  "--ck-font-family": "'Space Grotesk', system-ui, sans-serif",
  "--ck-border-radius": "20px",
  "--ck-body-background": "#ffffff",
  "--ck-body-color": "#0f172a",
  "--ck-primary-button-background": "#1d2f50",
  "--ck-primary-button-hover-background": "#1e3a6e",
  "--ck-primary-button-color": "#ffffff",
  "--ck-connectbutton-background": "#1d2f50",
  "--ck-connectbutton-color": "#ffffff",
  "--ck-focus-color": "#2563eb",
  "--ck-spinner-color": "#2563eb",
}
```

---

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| USDC | `0x3600000000000000000000000000000000000000` |
| OpenPaySavings | `0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523` |
| OpenPayCheckout | `0x4cf994d842d5a49f683f41f452cbfe7bece31007` |
| OpenPayOUSD (token) | `0xdd9cb6cbe39f5caf475241124e749875d7e7b355` |
| OpenPayOUSDSwap | `0x5fa7eea107a26102c676b9db6eca311849cefdfd` |

---

## References

- wagmi docs: https://wagmi.sh
- ConnectKit docs: https://docs.family.co/connectkit
- WalletConnect Cloud: https://cloud.walletconnect.com
- Arc developer docs: https://docs.arc.io
- Arc Testnet Explorer: https://explorer.testnet.arc.io
- Arc Mainnet Explorer: https://explorer.arc.io
