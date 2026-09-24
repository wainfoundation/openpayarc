/**
 * wagmi configuration — injected + WalletConnect + Coinbase Wallet
 * WalletConnect enables mobile wallets (MetaMask Mobile, Trust, OKX, Phantom…)
 * in any external browser where no extension is injected.
 */

import { http, createConfig } from 'wagmi'
import { mainnet, base, arbitrum, polygon, sepolia, baseSepolia, arbitrumSepolia, polygonAmoy } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { getChain } from '@/onchain-facts'

const ARC_MAINNET_RPC = getChain(5042)?.rpcUrls[0] ?? 'https://rpc.mainnet.arc.io'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, ARC_MAINNET_RPC)

// WalletConnect Project ID — get your own free one at https://cloud.walletconnect.com
// The fallback is a public demo ID that works but has lower rate limits
const WC_PROJECT_ID: string = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '2f05ae7f1116030fde2d36508f472bfb'

export const config = createConfig({
  // Arc chains first, then all bridge source chains (mainnet + testnet)
  chains: [
    arcTestnet, arc,
    // Mainnet bridge sources
    mainnet, base, arbitrum, polygon,
    // Testnet bridge sources
    sepolia, baseSepolia, arbitrumSepolia, polygonAmoy,
  ],
  connectors: [
    // 1. Injected: MetaMask extension, OKX extension, Phantom extension, Brave Wallet, etc.
    injected({ shimDisconnect: true }),

    // 2. WalletConnect v2: shows QR code on desktop, deep-link on mobile external browser
    //    Works with MetaMask Mobile, Trust Wallet, OKX Mobile, Phantom Mobile, Rabby Mobile, etc.
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

    // 3. Coinbase Wallet: works on mobile and desktop, has its own deep-link flow
    coinbaseWallet({
      appName: 'OpenPay Arc',
      appLogoUrl: 'https://openpayarc.netlify.app/icon-192.png',
    }),
  ],
  transports: {
    [arcTestnet.id]:       http(),
    [arc.id]:              http(ARC_MAINNET_RPC),
    // Mainnet bridge sources
    [mainnet.id]:          http(),
    [base.id]:             http(),
    [arbitrum.id]:         http(),
    [polygon.id]:          http(),
    // Testnet bridge sources
    [sepolia.id]:          http(),
    [baseSepolia.id]:      http(),
    [arbitrumSepolia.id]:  http(),
    [polygonAmoy.id]:      http(),
  },
})
