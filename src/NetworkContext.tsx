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

export interface NetworkContextValue {
  mode: NetworkMode
  chainId: number
  chainName: string
  isTestnet: boolean
  setMode: (mode: NetworkMode) => void
  paymentMethods: PaymentMethodsConfig
  setPaymentMethod: (key: PaymentMethodKey, enabled: boolean) => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

const NETWORK_KEY = 'openpay:network'
const METHODS_KEY = 'openpay:payment-methods'

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

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NetworkMode>(readStoredMode)
  const [paymentMethods, setMethodsState] = useState<PaymentMethodsConfig>(readStoredMethods)

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

  const chainId = CHAIN_IDS[mode]
  const chainName = requireChain(chainId).name

  return (
    <NetworkContext.Provider value={{
      mode, chainId, chainName, isTestnet: mode === 'testnet', setMode,
      paymentMethods, setPaymentMethod,
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
