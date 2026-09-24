/**
 * OpenPay Partner API Integration
 * OAuth2 connect flow + account status display
 */
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Loader2, Link2, Unlink, Wallet } from 'lucide-react'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

// ── Types ────────────────────────────────────────────────────────────────────
interface OpenPayProfile {
  id?: string
  username?: string
  display_name?: string
  avatar_url?: string
  email?: string
  wallet_address?: string
  balance?: string
  currency?: string
  verified?: boolean
}

interface ConnectedAccount {
  accessToken: string
  profile: OpenPayProfile
  connectedAt: number
}

const STORAGE_KEY = 'openpay_connected_account'

function loadAccount(): ConnectedAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as ConnectedAccount : null
  } catch { return null }
}

function saveAccount(acc: ConnectedAccount) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(acc))
}

function clearAccount() {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useOpenPayAccount() {
  const [account, setAccount] = useState<ConnectedAccount | null>(loadAccount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/openpay/auth-url')
      const data = await res.json() as { authUrl?: string; state?: string; error?: string }
      if (data.error || !data.authUrl) throw new Error(data.error ?? 'Failed to get auth URL')
      // Store state for CSRF check
      sessionStorage.setItem('openpay_oauth_state', data.state ?? '')
      // Open in same window (callback will return here)
      window.location.href = data.authUrl
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    clearAccount()
    setAccount(null)
    setError(null)
  }, [])

  const refresh = useCallback(async (token: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/openpay/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const profile = await res.json() as OpenPayProfile
      const acc: ConnectedAccount = { accessToken: token, profile, connectedAt: Date.now() }
      saveAccount(acc)
      setAccount(acc)
    } catch (e) {
      setError((e as Error).message)
    } finally { setLoading(false) }
  }, [])

  // Handle OAuth callback (code in URL hash/search)
  const handleCallback = useCallback(async (code: string, state: string) => {
    const storedState = sessionStorage.getItem('openpay_oauth_state') ?? ''
    if (storedState && state && storedState !== state) {
      setError('OAuth state mismatch — possible CSRF. Please try again.')
      return
    }
    setLoading(true); setError(null)
    try {
      const tokenRes = await fetch('/api/openpay/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
      if (!tokenData.access_token) throw new Error(tokenData.error ?? 'Token exchange failed')
      await refresh(tokenData.access_token)
      sessionStorage.removeItem('openpay_oauth_state')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }, [refresh])

  // Auto-detect OAuth callback — parse once from URL, don't use an effect
  const callbackCode = (() => {
    try {
      const p = new URLSearchParams(window.location.search)
      return { code: p.get('code'), state: p.get('state') }
    } catch { return { code: null, state: null } }
  })()
  const [callbackHandled, setCallbackHandled] = useState(false)
  if (callbackCode.code && !callbackHandled) {
    setCallbackHandled(true)
    void handleCallback(callbackCode.code, callbackCode.state ?? '')
  }

  return { account, loading, error, connect, disconnect, refresh: () => account && refresh(account.accessToken) }
}

// ── OpenPay Connect Widget ────────────────────────────────────────────────────
interface Props {
  open: boolean
  onClose: () => void
}

export default function OpenPayConnect({ open, onClose }: Props) {
  const { account, loading, error, connect, disconnect, refresh } = useOpenPayAccount()
  const [walletLoading, setWalletLoading] = useState(false)
  const [walletInfo, setWalletInfo] = useState<{ address?: string; balance?: string } | null>(null)

  const fetchWallet = useCallback(async () => {
    if (!account) return
    setWalletLoading(true)
    try {
      const res = await fetch('/api/openpay/wallet', {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      })
      const data = await res.json() as { address?: string; balance?: string }
      setWalletInfo(data)
    } catch { /* silent */ }
    setWalletLoading(false)
  }, [account])

  // Fetch wallet details when the sheet opens — triggered via key prop remount
  const [walletFetched, setWalletFetched] = useState(false)
  if (open && account && !walletFetched && !walletLoading) {
    setWalletFetched(true)
    void fetchWallet()
  }
  if (!open && walletFetched) setWalletFetched(false)

  const springs = { sheet: { type: 'spring' as const, damping: 32, stiffness: 300 } }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: '#eff6ff' }}>
                    <Link2 className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">OpenPay Connection</h2>
                    <p className="text-xs text-slate-400">Partner Integration</p>
                  </div>
                </div>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="size-10 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-slate-500">
                    {account ? 'Refreshing account…' : 'Connecting to OpenPay…'}
                  </p>
                </div>
              ) : account ? (
                /* ── Connected State ── */
                <div className="space-y-4">
                  {/* Connected badge */}
                  <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                    <p className="text-sm font-semibold text-green-700">Connected to OpenPay</p>
                    <span className="ml-auto text-xs text-green-600">{new Date(account.connectedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Profile card */}
                  <div className="rounded-2xl p-4 space-y-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                    <div className="flex items-center gap-3">
                      {account.profile.avatar_url ? (
                        <img src={account.profile.avatar_url} alt="" className="size-12 rounded-full object-cover" />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-lg">
                          {(account.profile.display_name ?? account.profile.username ?? 'O').slice(0,1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{account.profile.display_name ?? account.profile.username ?? 'OpenPay User'}</p>
                        {account.profile.username && <p className="text-xs text-slate-400">@{account.profile.username}</p>}
                        {account.profile.verified && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                            <CheckCircle2 className="size-3" /> Verified
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Wallet info */}
                    <div className="space-y-1.5 border-t pt-3" style={{ borderColor: '#dbeafe' }}>
                      {(account.profile.wallet_address || walletInfo?.address) && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Wallet</span>
                          <span className="font-mono text-xs text-slate-600">
                            {(() => { const a = account.profile.wallet_address ?? walletInfo?.address ?? ''; return a.length > 18 ? `${a.slice(0,10)}…${a.slice(-8)}` : a })()}
                          </span>
                        </div>
                      )}
                      {(account.profile.balance ?? walletInfo?.balance) && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Balance</span>
                          <span className="text-sm font-bold text-slate-900">
                            {account.profile.balance ?? walletInfo?.balance} {account.profile.currency ?? 'π'}
                          </span>
                        </div>
                      )}
                      {walletLoading && <p className="text-xs text-slate-400 text-center">Loading wallet…</p>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { void refresh() }}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                      style={{ border: '1.5px solid #bfdbfe' }}
                    >
                      <RefreshCw className="size-4" /> Refresh
                    </button>
                    <a
                      href="https://openpy.space"
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                      style={{ border: '1.5px solid #e2e8f0' }}
                    >
                      <ExternalLink className="size-4" /> OpenPay
                    </a>
                  </div>

                  <button
                    onClick={disconnect}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
                    style={{ border: '1.5px solid #fecaca' }}
                  >
                    <Unlink className="size-4" /> Disconnect OpenPay
                  </button>

                  <p className="text-center text-xs text-slate-400">
                    Data shared under OpenPay Partner Terms · <a href="https://openpy.space/privacy" target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>
                  </p>
                </div>
              ) : (
                /* ── Connect State ── */
                <div className="space-y-5">
                  {/* Hero */}
                  <div className="rounded-2xl p-5 text-center" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', border: '1px solid #ddd6fe' }}>
                    <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
                      <Wallet className="size-7 text-white" />
                    </div>
                    <h3 className="font-bold text-slate-900">Connect OpenPay</h3>
                    <p className="mt-1 text-sm text-slate-500">Link your OpenPay account to view your Pi wallet balance and activity alongside your USDC wallet.</p>
                  </div>

                  {/* Feature list */}
                  <div className="space-y-2">
                    {[
                      { icon: Wallet, label: 'View Pi wallet balance', desc: 'See your Pi balance in one place' },
                      { icon: CheckCircle2, label: 'Unified transaction history', desc: 'USDC and Pi activity side by side' },
                      { icon: Link2, label: 'Secure OAuth2 connection', desc: 'No private keys shared — read-only access' },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: '#dbeafe' }}>
                          <Icon className="size-3.5 text-blue-700" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{label}</p>
                          <p className="text-xs text-slate-400">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                      <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-600">Connection failed</p>
                        <p className="text-xs text-red-500">{error}</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => { void connect() }}
                    disabled={loading}
                    className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Link2 className="size-4" />
                      Connect OpenPay Account
                    </span>
                  </button>

                  <p className="text-center text-xs text-slate-400">
                    You'll be redirected to OpenPay to authorize the connection. OpenPay Arc receives read-only access to your profile and wallet.
                  </p>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
