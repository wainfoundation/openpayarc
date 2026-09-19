/**
 * usePasskeyAuth — Circle Modular Wallets passkey registration + login.
 * Persists the P256Credential to sessionStorage so the session survives
 * page refreshes within the same browser tab (production should use httpOnly cookies).
 */
import { useState, useEffect, useCallback } from 'react'
import { createPublicClient } from 'viem'
import { arcTestnet, arc } from 'viem/chains'
import {
  createBundlerClient,
  toWebAuthnAccount,
  type P256Credential,
} from 'viem/account-abstraction'
import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
} from '@circle-fin/modular-wallets-core'
import { useNetwork } from '@/NetworkContext'

const STORAGE_KEY = 'openpay_arc_credential'
const CLIENT_KEY = import.meta.env.VITE_CLIENT_KEY as string
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL as string

export type AuthStatus =
  | 'idle'
  | 'registering'
  | 'logging_in'
  | 'restoring'
  | 'authenticated'
  | 'error'

// Infer the smart account type from the return of toCircleSmartAccount
type SmartAccount = Awaited<ReturnType<typeof toCircleSmartAccount>>

export interface PasskeyAuthState {
  status: AuthStatus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  account: SmartAccount | null
  address: `0x${string}` | null
  error: string | null
  register: (username: string) => Promise<void>
  login: () => Promise<void>
  logout: () => void
  isReady: boolean
}

function getChainPath(isTestnet: boolean) {
  return isTestnet ? '/arcTestnet' : '/arc'
}

function getChain(isTestnet: boolean) {
  return isTestnet ? arcTestnet : arc
}

async function buildAccount(
  credential: P256Credential,
  isTestnet: boolean,
  username?: string,
): Promise<SmartAccount> {
  const chainPath = getChainPath(isTestnet)
  const chain = getChain(isTestnet)
  const modularTransport = toModularTransport(`${CLIENT_URL}${chainPath}`, CLIENT_KEY)
  const publicClient = createPublicClient({ chain, transport: modularTransport })
  const owner = toWebAuthnAccount({ credential })
  return toCircleSmartAccount({ client: publicClient, owner, name: username })
}

export function usePasskeyAuth(): PasskeyAuthState {
  const { isTestnet } = useNetwork()
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [account, setAccount] = useState<SmartAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isConfigured = Boolean(CLIENT_KEY && CLIENT_URL)

  // Restore session on mount
  useEffect(() => {
    if (!isConfigured) return
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    setStatus('restoring')
    const credential = JSON.parse(raw) as P256Credential
    buildAccount(credential, isTestnet)
      .then(acc => { setAccount(acc); setStatus('authenticated') })
      .catch(() => { sessionStorage.removeItem(STORAGE_KEY); setStatus('idle') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTestnet, isConfigured])

  const register = useCallback(async (username: string) => {
    if (!isConfigured) { setError('VITE_CLIENT_KEY is not set. See setup instructions.'); return }
    setStatus('registering')
    setError(null)
    try {
      const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY)
      const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Register,
        username: username.trim() || 'openpay-user',
      })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credential))
      const acc = await buildAccount(credential, isTestnet, username)
      setAccount(acc)
      setStatus('authenticated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('NotAllowed') ? 'Passkey cancelled or timed out. Try again.'
        : msg.includes('InvalidState') ? 'A passkey already exists for this username. Try "Sign in" instead.'
        : msg.includes('Security') ? 'Passkey domain mismatch. Check Console setup.'
        : msg.includes('CLIENT_KEY') || msg.includes('401') ? 'Invalid client key. Paste your key from Circle Console.'
        : `Registration failed: ${msg.slice(0, 120)}`
      )
      setStatus('error')
    }
  }, [isTestnet, isConfigured])

  const login = useCallback(async () => {
    if (!isConfigured) { setError('VITE_CLIENT_KEY is not set. See setup instructions.'); return }
    setStatus('logging_in')
    setError(null)
    try {
      const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY)
      const credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Login,
      })
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credential))
      const acc = await buildAccount(credential, isTestnet)
      setAccount(acc)
      setStatus('authenticated')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('NotAllowed') ? 'Passkey cancelled or timed out. Try again.'
        : msg.includes('Security') ? 'Passkey domain mismatch. Check Console setup.'
        : `Sign-in failed: ${msg.slice(0, 120)}`
      )
      setStatus('error')
    }
  }, [isTestnet, isConfigured])

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY)
    setAccount(null)
    setStatus('idle')
    setError(null)
  }, [])

  return {
    status,
    account,
    address: (account as { address?: `0x${string}` } | null)?.address ?? null,
    error,
    register,
    login,
    logout,
    isReady: isConfigured,
  }
}

export { createBundlerClient, toModularTransport, getChainPath, getChain }
