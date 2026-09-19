/**
 * useGoogleAuth — Circle user-controlled wallet via Google OAuth.
 *
 * Flow:
 *   1. Init W3S SDK + get deviceId (auto on mount)
 *   2. POST /api/wallet/device-token  → deviceToken + deviceEncryptionKey
 *   3. sdk.performLogin(GOOGLE)       → OAuth redirect + callback → userToken + encryptionKey
 *   4. POST /api/wallet/initialize    → challengeId  (or 155106 = already exists)
 *   5. sdk.execute(challengeId)       → wallet created
 *   6. POST /api/wallet/wallets       → fetch address
 *
 * Tokens are stored in sessionStorage so they survive OAuth redirects but are
 * cleared on browser close (good enough for a demo; use httpOnly cookies in production).
 */
import { useEffect, useRef, useState } from 'react'
import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk'
import { SocialLoginProvider } from '@circle-fin/w3s-pw-web-sdk/dist/src/types'

export type GoogleAuthStatus =
  | 'idle'
  | 'initialising'
  | 'ready'           // deviceId obtained, can start login
  | 'getting_token'   // fetching deviceToken from backend
  | 'oauth'           // OAuth popup open
  | 'creating_wallet' // executing challenge
  | 'authenticated'
  | 'error'

export interface GoogleAuthState {
  status: GoogleAuthStatus
  address: string | null
  error: string | null
  isReady: boolean
  login: () => Promise<void>
  logout: () => void
}

const SS_KEY = 'openpay_google_session'

interface Session {
  userToken: string
  encryptionKey: string
  deviceToken: string
  deviceEncryptionKey: string
  address?: string
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch { return null }
}
function saveSession(s: Session) {
  sessionStorage.setItem(SS_KEY, JSON.stringify(s))
}
function clearSession() {
  sessionStorage.removeItem(SS_KEY)
}

export function useGoogleAuth(): GoogleAuthState {
  const circleAppId = import.meta.env.VITE_CIRCLE_APP_ID as string | undefined
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  const isReady = Boolean(circleAppId && googleClientId)

  const sdkRef = useRef<W3SSdk | null>(null)
  const deviceIdRef = useRef<string>('')
  const sessionRef = useRef<Session | null>(null)

  const [status, setStatus] = useState<GoogleAuthStatus>('idle')
  const [address, setAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore session on mount
  useEffect(() => {
    const saved = loadSession()
    if (saved?.address) {
      sessionRef.current = saved
      setAddress(saved.address)
      setStatus('authenticated')
      return
    }

    if (!isReady) { setStatus('ready'); return }

    setStatus('initialising')

    const init = async () => {
      try {
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')

        const onLoginComplete = (err: unknown, result: unknown) => {
          if (err) {
            setError((err as Error).message ?? 'Google login failed')
            setStatus('error')
            return
          }
          const { userToken, encryptionKey } = result as { userToken: string; encryptionKey: string }
          const existing = sessionRef.current ?? {} as Partial<Session>
          const next: Session = {
            deviceToken: existing.deviceToken ?? '',
            deviceEncryptionKey: existing.deviceEncryptionKey ?? '',
            userToken,
            encryptionKey,
          }
          sessionRef.current = next
          saveSession(next)
          void continueAfterLogin(next)
        }

        const sdk = new W3SSdk(
          {
            appSettings: { appId: circleAppId! },
            loginConfigs: {
              deviceToken: '',
              deviceEncryptionKey: '',
              google: {
                clientId: googleClientId!,
                redirectUri: window.location.origin,
                selectAccountPrompt: true,
              },
            },
          },
          onLoginComplete,
        )
        sdkRef.current = sdk
        deviceIdRef.current = await sdk.getDeviceId()
        setStatus('ready')
      } catch (e) {
        setError((e as Error).message ?? 'SDK init failed')
        setStatus('error')
      }
    }

    void init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const continueAfterLogin = async (session: Session) => {
    setStatus('creating_wallet')
    try {
      // Step 3: initialise user / get challengeId
      const initRes = await fetch('/api/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: session.userToken }),
      })
      const initData = (await initRes.json()) as { challengeId?: string; code?: number; error?: string }

      let addr: string | undefined

      if (initData.code !== 155106 && initData.challengeId) {
        // New user — execute challenge to create wallet
        await new Promise<void>((resolve, reject) => {
          const sdk = sdkRef.current
          if (!sdk) { reject(new Error('SDK not ready')); return }
          sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey })
          sdk.execute(initData.challengeId!, (err) => {
            if (err) reject(err instanceof Error ? err : new Error(String(err)))
            else resolve()
          })
        })
      }

      // Step 4: fetch wallet address
      const walletsRes = await fetch('/api/wallet/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: session.userToken }),
      })
      const walletsData = (await walletsRes.json()) as { wallets?: { address: string }[] }
      addr = walletsData.wallets?.[0]?.address

      const updated = { ...session, address: addr }
      sessionRef.current = updated
      saveSession(updated)
      setAddress(addr ?? null)
      setStatus('authenticated')
    } catch (e) {
      setError((e as Error).message ?? 'Wallet creation failed')
      setStatus('error')
    }
  }

  const login = async () => {
    if (!isReady || !sdkRef.current || !deviceIdRef.current) {
      setError('Google sign-in not configured. Set VITE_CIRCLE_APP_ID and VITE_GOOGLE_CLIENT_ID.')
      setStatus('error')
      return
    }
    setError(null)
    setStatus('getting_token')

    // Step 1: get deviceToken from backend
    const dtRes = await fetch('/api/wallet/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceIdRef.current }),
    })
    const dtData = (await dtRes.json()) as { deviceToken?: string; deviceEncryptionKey?: string; error?: string }
    if (!dtData.deviceToken) {
      setError(dtData.error ?? 'Failed to get device token')
      setStatus('error')
      return
    }

    sessionRef.current = {
      deviceToken: dtData.deviceToken,
      deviceEncryptionKey: dtData.deviceEncryptionKey!,
      userToken: '',
      encryptionKey: '',
    }

    // Step 2: trigger Google OAuth (callback fires onLoginComplete above)
    sdkRef.current.updateConfigs({
      appSettings: { appId: circleAppId! },
      loginConfigs: {
        deviceToken: dtData.deviceToken,
        deviceEncryptionKey: dtData.deviceEncryptionKey!,
        google: {
          clientId: googleClientId!,
          redirectUri: window.location.origin,
          selectAccountPrompt: true,
        },
      },
    })
    setStatus('oauth')
    void sdkRef.current.performLogin(SocialLoginProvider.GOOGLE)
  }

  const logout = () => {
    clearSession()
    sessionRef.current = null
    setAddress(null)
    setStatus('ready')
    setError(null)
  }

  return { status, address, error, isReady, login, logout }
}
