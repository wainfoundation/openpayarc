/**
 * NetworkContext — global network selection (testnet / mainnet) +
 * payment method visibility config. Both are admin-controlled and
 * persisted to localStorage.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { requireChain } from '@/onchain-facts'

export type NetworkMode = 'testnet' | 'mainnet'

// Arc Testnet chainId = 5042002, Arc mainnet chainId = 5042
export const CHAIN_IDS: Record<NetworkMode, number> = {
  testnet: 5042002,
  mainnet: 5042,
}

// All payment methods the admin can toggle
export type PaymentMethodKey = 'paypal' | 'card' | 'venmo' | 'applepay' | 'googlepay' | 'paylater'

export const ALL_PAYMENT_METHODS: PaymentMethodKey[] = [
  'paypal', 'card', 'venmo', 'applepay', 'googlepay', 'paylater',
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, { label: string; sub: string }> = {
  paypal:   { label: 'PayPal',           sub: 'PayPal balance & linked accounts' },
  card:     { label: 'Debit / Credit Card', sub: 'Visa, Mastercard, Amex, Discover' },
  venmo:    { label: 'Venmo',            sub: 'US users only' },
  applepay: { label: 'Apple Pay',        sub: 'Safari on iPhone / Mac' },
  googlepay:{ label: 'Google Pay',       sub: 'Chrome on Android / desktop' },
  paylater: { label: 'Pay Later',        sub: '4 interest-free payments' },
}

export type PaymentMethodsConfig = Record<PaymentMethodKey, boolean>

const DEFAULT_METHODS: PaymentMethodsConfig = {
  paypal: true, card: true, venmo: true, applepay: true, googlepay: true, paylater: true,
}

// ─── Feature flags (admin-controlled, persisted) ─────────────────────────────

export type FeatureFlagKey =
  | 'send' | 'receive' | 'transfer' | 'swap' | 'bridge' | 'savings'
  | 'payLinks' | 'ledger' | 'buyFiat' | 'connectedAccounts' | 'support'
  | 'inbox' | 'transactions' | 'scanner'
  | 'eurc' | 'usyc' | 'stableFX' | 'chainlink' | 'pyth'
  | 'agentEconomy' | 'batchSend' | 'unifiedBalance'

export const ALL_FEATURES: FeatureFlagKey[] = [
  'send', 'receive', 'transfer', 'swap', 'bridge', 'savings',
  'payLinks', 'ledger', 'buyFiat', 'connectedAccounts', 'support',
  'inbox', 'transactions', 'scanner',
  'eurc', 'usyc', 'stableFX', 'chainlink', 'pyth',
  'agentEconomy', 'batchSend', 'unifiedBalance',
]

export const FEATURE_LABELS: Record<FeatureFlagKey, { label: string; sub: string }> = {
  send:              { label: 'Send USDC',          sub: 'Send funds to any address' },
  receive:           { label: 'Receive / QR',        sub: 'Show receive QR and address' },
  transfer:          { label: 'Transfer',            sub: 'Same-chain USDC transfer' },
  swap:              { label: 'Swap',                sub: 'Token swap via Circle App Kit' },
  bridge:            { label: 'Bridge',              sub: 'CCTP cross-chain bridge' },
  savings:           { label: 'Savings',             sub: 'OpenPaySavings vault' },
  payLinks:          { label: 'Pay Links / QR',      sub: 'Embeddable eCommerce checkout' },
  ledger:            { label: 'Ledger',              sub: 'Onchain USDC transfer history' },
  buyFiat:           { label: 'Buy USDC (Fiat)',     sub: 'PayPal / card onramp' },
  connectedAccounts: { label: 'Connected Accounts',  sub: 'OpenPay OAuth link' },
  support:           { label: 'Support',             sub: 'Support link in Profile' },
  inbox:             { label: 'Inbox tab',           sub: 'Notification inbox' },
  transactions:      { label: 'Transactions tab',    sub: 'Full tx history tab' },
  scanner:           { label: 'QR Scanner',          sub: 'Camera QR code scanner' },
  eurc:              { label: 'EURC (Euro)',          sub: 'Euro stablecoin — send, receive, balance' },
  usyc:              { label: 'USYC (Yield)',         sub: 'Tokenized T-Bill yield on Arc' },
  stableFX:          { label: 'StableFX',            sub: 'USDC ↔ EURC on-chain FX swap' },
  chainlink:         { label: 'Chainlink Prices',    sub: 'Live price feeds on Arc Mainnet' },
  pyth:              { label: 'Pyth Oracle',         sub: 'Pull-model BTC/USD on Arc Testnet' },
  agentEconomy:      { label: 'Agent Economy',       sub: 'ERC-8004 identity + ERC-8183 jobs' },
  batchSend:         { label: 'Batch Send',          sub: 'Send USDC to multiple addresses' },
  unifiedBalance:    { label: 'Unified Balance',     sub: 'Combined USDC across all chains' },
}

export type FeatureFlagsConfig = Record<FeatureFlagKey, boolean>

const DEFAULT_FEATURES: FeatureFlagsConfig = {
  send: true, receive: true, transfer: true, swap: true, bridge: true,
  savings: true, payLinks: true, ledger: true, buyFiat: true,
  connectedAccounts: true, support: true, inbox: true, transactions: true, scanner: true,
  eurc: true, usyc: true, stableFX: true, chainlink: true, pyth: true,
  agentEconomy: true, batchSend: true, unifiedBalance: true,
}

export interface NetworkContextValue {
  mode: NetworkMode
  chainId: number
  chainName: string
  isTestnet: boolean
  setMode: (mode: NetworkMode) => void
  paymentMethods: PaymentMethodsConfig
  setPaymentMethod: (key: PaymentMethodKey, enabled: boolean) => void
  features: FeatureFlagsConfig
  setFeature: (key: FeatureFlagKey, enabled: boolean) => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

const NETWORK_KEY  = 'openpay:network'
const METHODS_KEY  = 'openpay:payment-methods'
const FEATURES_KEY = 'openpay:features'

function readStoredMode(): NetworkMode {
  try {
    const stored = localStorage.getItem(NETWORK_KEY)
    if (stored === 'mainnet' || stored === 'testnet') return stored
  } catch { /* ignore */ }
  return 'testnet'
}

function readStoredMethods(): PaymentMethodsConfig {
  try {
    const raw = localStorage.getItem(METHODS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PaymentMethodsConfig>
      return { ...DEFAULT_METHODS, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_METHODS }
}

function readStoredFeatures(): FeatureFlagsConfig {
  try {
    const raw = localStorage.getItem(FEATURES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FeatureFlagsConfig>
      return { ...DEFAULT_FEATURES, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_FEATURES }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState]           = useState<NetworkMode>(readStoredMode)
  const [paymentMethods, setMethodsState] = useState<PaymentMethodsConfig>(readStoredMethods)
  const [features, setFeaturesState]   = useState<FeatureFlagsConfig>(readStoredFeatures)

  const setMode = useCallback((next: NetworkMode) => {
    setModeState(next)
    try { localStorage.setItem(NETWORK_KEY, next) } catch { /* ignore */ }
  }, [])

  const setPaymentMethod = useCallback((key: PaymentMethodKey, enabled: boolean) => {
    setMethodsState(prev => {
      const next = { ...prev, [key]: enabled }
      try { localStorage.setItem(METHODS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const setFeature = useCallback((key: FeatureFlagKey, enabled: boolean) => {
    setFeaturesState(prev => {
      const next = { ...prev, [key]: enabled }
      try { localStorage.setItem(FEATURES_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const chainId = CHAIN_IDS[mode]
  const chainName = requireChain(chainId).name

  return (
    <NetworkContext.Provider value={{
      mode, chainId, chainName, isTestnet: mode === 'testnet', setMode,
      paymentMethods, setPaymentMethod,
      features, setFeature,
    }}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return ctx
}
