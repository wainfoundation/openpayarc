/**
 * AuthContext — wraps the whole app with auth state.
 * Supports two auth paths:
 *   1. Circle Passkey (modular smart account)
 *   2. Google Sign-In (Circle user-controlled wallet)
 * Shows AuthPage until one of the paths authenticates.
 */
import { createContext, useContext } from 'react'
import { usePasskeyAuth, type PasskeyAuthState } from '@/hooks/usePasskeyAuth'
import { useGoogleAuth, type GoogleAuthState } from '@/hooks/useGoogleAuth'
import AuthPage from '@/components/AuthPage'

interface AuthContextValue {
  passkey: PasskeyAuthState
  google: GoogleAuthState
  /** Wallet address — from whichever auth succeeded */
  walletAddress: string | null
  /** Which auth method is active */
  authMethod: 'passkey' | 'google' | null
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const passkey = usePasskeyAuth()
  const google  = useGoogleAuth()

  const passkeyAuthed = passkey.status === 'authenticated'
  const googleAuthed  = google.status  === 'authenticated'
  const isAuthed = passkeyAuthed || googleAuthed

  const walletAddress = passkeyAuthed ? passkey.address : googleAuthed ? google.address : null
  const authMethod: 'passkey' | 'google' | null = passkeyAuthed ? 'passkey' : googleAuthed ? 'google' : null

  const logout = () => {
    if (passkeyAuthed) passkey.logout?.()
    if (googleAuthed)  google.logout()
  }

  const value: AuthContextValue = { passkey, google, walletAddress, authMethod, logout }

  if (!isAuthed) {
    return (
      <AuthContext.Provider value={value}>
        <AuthPage auth={passkey} />
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
