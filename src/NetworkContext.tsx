/**
 * NetworkContext — global network selection (testnet / mainnet).
 * Admin sets this; it is persisted to localStorage so it survives refresh.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { requireChain } from '@/onchain-facts'

export type NetworkMode = 'testnet' | 'mainnet'

// Arc Testnet chainId = 5042002, Arc mainnet chainId = 5042
export const CHAIN_IDS: Record<NetworkMode, number> = {
  testnet: 5042002,
  mainnet: 5042,
}

export interface NetworkContextValue {
  mode: NetworkMode
  chainId: number
  chainName: string
  isTestnet: boolean
  setMode: (mode: NetworkMode) => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

const STORAGE_KEY = 'openpay:network'

function readStoredMode(): NetworkMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'mainnet' || stored === 'testnet') return stored
  } catch {
    // localStorage unavailable
  }
  return 'testnet'
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NetworkMode>(readStoredMode)

  const setMode = useCallback((next: NetworkMode) => {
    setModeState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  const chainId = CHAIN_IDS[mode]
  const chainName = requireChain(chainId).name

  return (
    <NetworkContext.Provider value={{ mode, chainId, chainName, isTestnet: mode === 'testnet', setMode }}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return ctx
}
