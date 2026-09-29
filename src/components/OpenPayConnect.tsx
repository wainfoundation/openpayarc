/**
 * OpenPay Partner Integration
 * OAuth2 connect flow + OUSD send / receive / scan / transfer history
 * API base: https://araojncyittkahvvpdrn.supabase.co/functions/v1/partner-transfer-api
 * Auth UI:  https://openpy.space/connect
 */
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ExternalLink, RefreshCw, CheckCircle2, AlertCircle,
  Loader2, Link2, Unlink, Send, QrCode, ArrowDownLeft,
  Clock, Copy, ArrowRight,
} from 'lucide-react'
import OUSDIcon from './OUSDIcon'

const spectral = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'
const OUSD_BLUE = '#0D47D1'

// ── Types ─────────────────────────────────────────────────────────────────────
interface OpenPayProfile {
  user_id?: string
  account_number?: string
  username?: string
  full_name?: string
  avatar_url?: string
  email?: string
  balance?: number
  currency?: string
  scope?: string
}

interface OPTransaction {
  id: string
  type: 'sent' | 'received'
  amount: number
  currency: string
  counterparty: string
  memo?: string
  created_at: string
  status: string
}

interface ConnectedAccount {
  accessToken: string
  profile: OpenPayProfile
  connectedAt: number
}

const STORAGE_KEY = 'openpay_connected_v2'

function loadAccount(): ConnectedAccount | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? (JSON.parse(r) as ConnectedAccount) : null } catch { return null }
}
function saveAccount(a: ConnectedAccount) { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)) }
function clearAccount() { localStorage.removeItem(STORAGE_KEY) }

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useOpenPayAccount() {
  const [account, setAccount] = useState<ConnectedAccount | null>(loadAccount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (token: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/openpay/me', { headers: { Authorization: `Bearer ${token}` } })
      const profile = await res.json() as OpenPayProfile
      if (!res.ok) throw new Error((profile as { message?: string }).message ?? 'Refresh failed')
      const acc: ConnectedAccount = { accessToken: token, profile, connectedAt: Date.now() }
      saveAccount(acc); setAccount(acc)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  const connect = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/openpay/auth-url')
      const data = await res.json() as { authUrl?: string; state?: string; error?: string }
      if (data.error || !data.authUrl) throw new Error(data.error ?? 'Failed to get auth URL')
      sessionStorage.setItem('openpay_oauth_state', data.state ?? '')
      window.location.href = data.authUrl
    } catch (e) { setError((e as Error).message); setLoading(false) }
  }, [])

  const disconnect = useCallback(() => { clearAccount(); setAccount(null); setError(null) }, [])

  const handleCallback = useCallback(async (code: string, state: string) => {
    const stored = sessionStorage.getItem('openpay_oauth_state') ?? ''
    if (stored && state && stored !== state) { setError('OAuth state mismatch — try again.'); return }
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
      window.history.replaceState({}, '', window.location.pathname)
    } catch (e) { setError((e as Error).message); setLoading(false) }
  }, [refresh])

  // Auto-handle OAuth callback
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const code = p.get('code')
    const state = p.get('state')
    if (code) void handleCallback(code, state ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    account, loading, error, connect, disconnect,
    refresh: () => account && void refresh(account.accessToken),
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void }

type Tab = 'overview' | 'send' | 'receive' | 'history'

export default function OpenPayConnect({ open, onClose }: Props) {
  const { account, loading, error, connect, disconnect, refresh } = useOpenPayAccount()
  const [tab, setTab] = useState<Tab>('overview')

  // Send form
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendMemo, setSendMemo] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  // History
  const [txns, setTxns] = useState<OPTransaction[]>([])
  const [txnLoading, setTxnLoading] = useState(false)

  // Copy feedback
  const [copied, setCopied] = useState(false)

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  }

  const fetchHistory = useCallback(async () => {
    if (!account) return
    setTxnLoading(true)
    try {
      const res = await fetch('/api/openpay/transactions', {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      })
      const data = await res.json() as { transactions?: OPTransaction[] } | OPTransaction[]
      setTxns(Array.isArray(data) ? data : (data.transactions ?? []))
    } catch { /* silent */ }
    setTxnLoading(false)
  }, [account])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && account && tab === 'history') void fetchHistory() }, [open, tab])

  const handleSend = async () => {
    if (!account || !sendTo || !sendAmount) return
    setSendLoading(true); setSendResult(null)
    try {
      const res = await fetch('/api/openpay/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` },
        body: JSON.stringify({
          recipient_account: sendTo.trim(),
          amount: parseFloat(sendAmount),
          currency: 'OUSD',
          memo: sendMemo,
        }),
      })
      const data = await res.json() as { message?: string; error?: string; tx_id?: string }
      if (res.ok) {
        setSendResult({ ok: true, message: data.message ?? `Sent ${sendAmount} OUSD` })
        setSendTo(''); setSendAmount(''); setSendMemo('')
        void refresh()
      } else {
        setSendResult({ ok: false, message: data.error ?? 'Transfer failed' })
      }
    } catch (e) { setSendResult({ ok: false, message: (e as Error).message }) }
    setSendLoading(false)
  }

  const springs = { sheet: { type: 'spring' as const, damping: 32, stiffness: 300 } }
  const accountNo = account?.profile.account_number ?? ''
  const displayName = account?.profile.full_name ?? account?.profile.username ?? 'OpenPay User'
  const balance = account?.profile.balance

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '92dvh' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet} onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="flex flex-col" style={{ maxHeight: 'calc(92dvh - 20px)' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: '#eff6ff' }}>
                    <Link2 className="size-4 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">OpenPay</h2>
                    <p className="text-xs text-slate-400">Partner Integration · OUSD</p>
                  </div>
                </div>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 pb-8">
                {/* ── Not connected ── */}
                {!account && (
                  <div className="space-y-4">
                    {/* Hero */}
                    <div className="rounded-2xl p-5 text-center" style={{ background: `${OUSD_BLUE}08`, border: `1px solid ${OUSD_BLUE}22` }}>
                      <div className="mx-auto mb-3 flex size-14 items-center justify-center">
                        <OUSDIcon size={56} />
                      </div>
                      <h3 className="font-bold text-slate-900">Connect OpenPay</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Link your OpenPay account to send, receive, and scan OUSD payments directly from OpenPay Arc.
                      </p>
                    </div>

                    {[
                      { icon: Send, label: 'Send OUSD', desc: 'Transfer OUSD to any OpenPay account number' },
                      { icon: ArrowDownLeft, label: 'Receive OUSD', desc: 'Share your account number or QR code' },
                      { icon: QrCode, label: 'Scan to pay', desc: 'Scan an OpenPay QR code to send instantly' },
                      { icon: Clock, label: 'Transaction history', desc: 'View all OUSD transfers in one place' },
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

                    {error && (
                      <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                        <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-red-600">Connection failed</p>
                          <p className="text-xs text-red-500">{error}</p>
                        </div>
                      </div>
                    )}

                    <button onClick={() => { void connect() }} disabled={loading}
                      className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
                      style={{ background: OUSD_BLUE }}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                      Connect OpenPay Account
                    </button>
                    <p className="text-center text-xs text-slate-400">
                      You'll be redirected to OpenPay to authorize. OpenPay Arc receives profile + OUSD balance access only.
                    </p>
                  </div>
                )}

                {/* ── Loading ── */}
                {loading && !account && (
                  <div className="flex flex-col items-center gap-3 py-10">
                    <Loader2 className="size-10 animate-spin" style={{ color: OUSD_BLUE }} />
                    <p className="text-sm font-medium text-slate-500">Connecting to OpenPay…</p>
                  </div>
                )}

                {/* ── Connected ── */}
                {account && !loading && (
                  <div className="space-y-4">
                    {/* Balance card */}
                    <div className="rounded-2xl p-4 text-white" style={{ background: OUSD_BLUE }}>
                      <div className="flex items-center gap-3 mb-3">
                        {account.profile.avatar_url
                          ? <img src={account.profile.avatar_url} alt="" className="size-10 rounded-full object-cover border-2 border-white/30" />
                          : <div className="flex size-10 items-center justify-center rounded-full bg-white/20 font-bold text-lg">{displayName.slice(0,1).toUpperCase()}</div>
                        }
                        <div>
                          <p className="font-bold">{displayName}</p>
                          {account.profile.username && <p className="text-xs text-white/60">@{account.profile.username}</p>}
                        </div>
                        <button onClick={() => void refresh()} className="ml-auto rounded-full p-1.5 bg-white/10 hover:bg-white/20">
                          <RefreshCw className="size-3.5" />
                        </button>
                      </div>
                      <div>
                        <p className="text-xs text-white/60 uppercase tracking-wider">OUSD Balance</p>
                        <p className="text-3xl font-bold">{balance !== undefined ? `${balance.toFixed(2)}` : '—'} <span className="text-lg font-normal text-white/70">OUSD</span></p>
                      </div>
                      {accountNo && (
                        <button onClick={() => copy(accountNo)}
                          className="mt-2 flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors">
                          <Copy className="size-3" />
                          {accountNo} {copied && <span className="text-green-300">Copied!</span>}
                        </button>
                      )}
                    </div>

                    {/* Tab bar */}
                    <div className="grid grid-cols-4 gap-1 rounded-xl p-1" style={{ background: '#f1f5f9' }}>
                      {([
                        { id: 'overview', icon: CheckCircle2, label: 'Overview' },
                        { id: 'send', icon: Send, label: 'Send' },
                        { id: 'receive', icon: ArrowDownLeft, label: 'Receive' },
                        { id: 'history', icon: Clock, label: 'History' },
                      ] as { id: Tab; icon: React.ElementType; label: string }[]).map(({ id, icon: Icon, label }) => (
                        <button key={id} onClick={() => setTab(id)}
                          className="flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-semibold transition-all"
                          style={tab === id
                            ? { background: 'white', color: OUSD_BLUE, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
                            : { color: '#94a3b8' }}>
                          <Icon className="size-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Overview tab */}
                    {tab === 'overview' && (
                      <div className="space-y-3">
                        {[
                          { label: 'Account number', value: accountNo || '—' },
                          { label: 'Email', value: account.profile.email || '—' },
                          { label: 'Scope', value: account.profile.scope || 'profile balance' },
                          { label: 'Connected', value: new Date(account.connectedAt).toLocaleDateString() },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[55%] text-right">{value}</span>
                          </div>
                        ))}
                        <a href="https://openpy.space" target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                          style={{ border: '1.5px solid #e2e8f0' }}>
                          <ExternalLink className="size-4" /> Open OpenPay
                        </a>
                        <button onClick={disconnect}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                          style={{ border: '1.5px solid #fecaca' }}>
                          <Unlink className="size-4" /> Disconnect
                        </button>
                      </div>
                    )}

                    {/* Send tab */}
                    {tab === 'send' && (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Send OUSD via OpenPay</p>
                        <div className="rounded-2xl p-4 space-y-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">RECIPIENT ACCOUNT NUMBER</label>
                            <input value={sendTo} onChange={e => setSendTo(e.target.value)}
                              placeholder="OP-XXXXXXXXXX"
                              className="w-full rounded-xl px-3 py-2.5 text-sm border border-slate-200 bg-white outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">AMOUNT (OUSD)</label>
                            <input type="number" value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                              placeholder="0.00" min="0.01" step="0.01"
                              className="w-full rounded-xl px-3 py-2.5 text-sm border border-slate-200 bg-white outline-none focus:border-blue-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">MEMO (OPTIONAL)</label>
                            <input value={sendMemo} onChange={e => setSendMemo(e.target.value)}
                              placeholder="What's this for?"
                              className="w-full rounded-xl px-3 py-2.5 text-sm border border-slate-200 bg-white outline-none focus:border-blue-400" />
                          </div>
                        </div>

                        {sendResult && (
                          <div className={`flex items-start gap-2 rounded-xl px-4 py-3 ${sendResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            {sendResult.ok
                              ? <CheckCircle2 className="size-4 shrink-0 text-green-600 mt-0.5" />
                              : <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />}
                            <p className={`text-sm font-medium ${sendResult.ok ? 'text-green-700' : 'text-red-600'}`}>{sendResult.message}</p>
                          </div>
                        )}

                        <button onClick={() => void handleSend()} disabled={sendLoading || !sendTo || !sendAmount}
                          className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: OUSD_BLUE }}>
                          {sendLoading ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" /> Send {sendAmount ? `${sendAmount} OUSD` : 'OUSD'}</>}
                        </button>
                      </div>
                    )}

                    {/* Receive tab */}
                    {tab === 'receive' && (
                      <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your OpenPay Account</p>
                        <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                          <div className="flex items-center justify-center">
                            <OUSDIcon size={40} />
                          </div>
                          <p className="text-xs text-slate-500">Share your account number to receive OUSD</p>
                          {accountNo ? (
                            <div className="rounded-xl bg-white px-4 py-3 font-mono text-base font-bold text-slate-800 border border-slate-200">
                              {accountNo}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400">No account number available</p>
                          )}
                          {accountNo && (
                            <button onClick={() => copy(accountNo)}
                              className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition-colors hover:bg-blue-50"
                              style={{ border: `1.5px solid ${OUSD_BLUE}33`, color: OUSD_BLUE }}>
                              <Copy className="size-4" />
                              {copied ? 'Copied!' : 'Copy Account Number'}
                            </button>
                          )}
                        </div>
                        <div className="flex items-start gap-2 rounded-xl px-4 py-3 bg-amber-50 border border-amber-200">
                          <AlertCircle className="size-4 shrink-0 text-amber-500 mt-0.5" />
                          <p className="text-xs text-amber-700">Only send OUSD from OpenPay accounts. Other tokens or chains cannot be received here.</p>
                        </div>
                      </div>
                    )}

                    {/* History tab */}
                    {tab === 'history' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">OUSD Transfers</p>
                          <button onClick={() => void fetchHistory()} className="text-xs text-blue-500 flex items-center gap-1">
                            <RefreshCw className="size-3" /> Refresh
                          </button>
                        </div>
                        {txnLoading && (
                          <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
                        )}
                        {!txnLoading && txns.length === 0 && (
                          <div className="rounded-2xl p-6 text-center" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                            <Clock className="size-8 mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-400">No transactions yet</p>
                          </div>
                        )}
                        {txns.map(tx => (
                          <div key={tx.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                            <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tx.type === 'received' ? 'bg-green-100' : 'bg-red-100'}`}>
                              {tx.type === 'received'
                                ? <ArrowDownLeft className="size-4 text-green-600" />
                                : <ArrowRight className="size-4 text-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{tx.counterparty}</p>
                              <p className="text-xs text-slate-400 truncate">{tx.memo || (tx.type === 'received' ? 'Received' : 'Sent')} · {new Date(tx.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold ${tx.type === 'received' ? 'text-green-600' : 'text-red-500'}`}>
                                {tx.type === 'received' ? '+' : '-'}{tx.amount.toFixed(2)} OUSD
                              </p>
                              <p className="text-xs text-slate-400">{tx.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
