/**
 * AuthPage — full-screen sign-in / sign-up.
 * Two auth paths:
 *   1. Circle Passkey (modular smart account, gasless)
 *   2. Google Sign-In  (Circle user-controlled wallet via W3S SDK)
 * Falls through to the main wallet once either path authenticates.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  KeyRound, Fingerprint, Loader2, AlertCircle,
  ArrowRight, ShieldCheck, Zap, Wallet, ChevronLeft,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { PasskeyAuthState } from '@/hooks/usePasskeyAuth'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'

interface Props { auth: PasskeyAuthState }
type Screen = 'landing' | 'passkey-register' | 'passkey-login'

const spring = { type: 'spring' as const, damping: 30, stiffness: 300 }
const spectral = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'

// ─── Google sign-in button ─────────────────────────────────────────────────

function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-sm font-semibold transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
      style={{ background: 'white', color: '#1d2f50', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin text-slate-400" />
      ) : (
        /* Google "G" logo in brand colours */
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <path d="M47.532 24.552c0-1.636-.147-3.2-.418-4.704H24.48v8.904h12.96c-.56 3.01-2.24 5.56-4.78 7.27l7.722 5.996c4.5-4.152 7.15-10.27 7.15-17.466z" fill="#4285F4"/>
          <path d="M24.48 48c6.48 0 11.924-2.148 15.9-5.832l-7.722-5.996c-2.148 1.44-4.896 2.296-8.178 2.296-6.28 0-11.598-4.24-13.498-9.944H2.984v6.192C6.94 42.84 15.168 48 24.48 48z" fill="#34A853"/>
          <path d="M10.982 28.524A14.51 14.51 0 0 1 10.18 24c0-1.576.272-3.108.802-4.524V13.284H2.984A23.963 23.963 0 0 0 .48 24c0 3.868.928 7.528 2.504 10.716l8-6.192z" fill="#FBBC05"/>
          <path d="M24.48 9.532c3.54 0 6.712 1.216 9.21 3.604l6.9-6.9C36.4 2.384 30.96 0 24.48 0 15.168 0 6.94 5.16 2.984 13.284l7.998 6.192c1.9-5.704 7.218-9.944 13.498-9.944z" fill="#EA4335"/>
        </svg>
      )}
      {loading ? 'Signing in with Google...' : 'Continue with Google'}
    </button>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
      <span className="text-xs font-medium text-slate-400">or</span>
      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
    </div>
  )
}

// ─── Feature row ─────────────────────────────────────────────────────────

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm" style={{ border: '1px solid var(--border)' }}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl" style={{ background: '#eff6ff', color: '#2563eb' }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────

export default function AuthPage({ auth }: Props) {
  const [screen, setScreen] = useState<Screen>('landing')
  const [username, setUsername] = useState('')
  const google = useGoogleAuth()

  const passkeyLoading = auth.status === 'registering' || auth.status === 'logging_in'
  const googleLoading = google.status === 'getting_token' || google.status === 'oauth' || google.status === 'creating_wallet'

  const anyLoading = passkeyLoading || googleLoading

  const handleRegister = () => { void auth.register(username || 'user') }
  const handleLogin    = () => { void auth.login() }
  const handleGoogle   = () => { void google.login() }

  // ── Restore / loading splash ────────────────────────────────────────────
  if (auth.status === 'restoring' || google.status === 'creating_wallet') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <div className="flex size-16 items-center justify-center rounded-2xl shadow-lg mb-4"
          style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
          <TokenUSDC variant="branded" size={32} />
        </div>
        <Loader2 className="size-6 animate-spin text-blue-500 mb-2" />
        <p className="text-sm font-medium text-slate-400">
          {google.status === 'creating_wallet' ? 'Setting up your wallet...' : 'Restoring session...'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: 'var(--bg-gradient)' }}>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4"
        style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        {screen !== 'landing' && (
          <button
            onClick={() => setScreen('landing')}
            className="mr-1 flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <div className="flex size-9 items-center justify-center rounded-xl shadow-sm"
          style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
          <TokenUSDC variant="branded" size={20} />
        </div>
        <div>
          <p className="text-base font-bold leading-none tracking-tight" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk',sans-serif', letterSpacing:'-0.02em'" }}>
            OpenPay <span style={{ color: '#2563eb' }}>Arc</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">USDC wallet · Powered by Circle</p>
        </div>
      </header>

      <AnimatePresence mode="wait">

        {/* ── Landing screen ──────────────────────────────────────── */}
        {screen === 'landing' && (
          <motion.div key="landing"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            transition={spring}
            className="flex flex-1 flex-col px-5 pt-5 pb-10"
          >
            {/* Hero card */}
            <div className="relative mb-5 overflow-hidden rounded-3xl" style={{ background: 'linear-gradient(135deg,#1d2f50 0%,#1e40af 60%,#3730a3 100%)' }}>
              <div className="h-1" style={{ background: spectral }} />
              {/* decorative blobs */}
              <div className="absolute -right-10 -top-10 size-48 rounded-full opacity-10 bg-white" />
              <div className="absolute -bottom-16 -left-8 size-52 rounded-full opacity-5 bg-white" />
              <div className="relative px-6 pt-7 pb-6">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
                  <Fingerprint className="size-6 text-white" />
                </div>
                <p className="text-2xl font-bold leading-tight text-white" style={{ fontFamily: "'Space Grotesk',sans-serif", letterSpacing: '-0.02em' }}>
                  Your USDC wallet,<br /><span className="text-blue-300">secured by you.</span>
                </p>
                <p className="mt-2 text-sm text-blue-200">
                  Sign in with Google or a passkey.<br />No seed phrases. No passwords.
                </p>
                {/* mini balance chip */}
                <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 backdrop-blur-sm">
                  <TokenUSDC variant="branded" size={14} />
                  <span className="text-xs font-semibold text-blue-200">OPEN USD · Arc Testnet</span>
                </div>
              </div>
            </div>

            {/* Feature list */}
            <div className="mb-6 space-y-2">
              <Feature icon={<Zap className="size-4" />}       title="Instant USDC transfers"    desc="Sub-second finality on Arc" />
              <Feature icon={<ShieldCheck className="size-4" />} title="Gasless transactions"     desc="Circle sponsors your gas fees" />
              <Feature icon={<Wallet className="size-4" />}    title="Smart contract wallet"      desc="ERC-4337 account abstraction" />
            </div>

            {/* Setup warning */}
            {!auth.isReady && !google.isReady && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3.5" style={{ border: '1px solid rgba(245,158,11,0.25)' }}>
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p className="text-xs text-amber-700 text-pretty">
                  <span className="font-semibold">Setup required:</span> Add <code className="rounded bg-amber-100 px-1">VITE_CLIENT_KEY</code>, <code className="rounded bg-amber-100 px-1">VITE_CIRCLE_APP_ID</code>, and <code className="rounded bg-amber-100 px-1">VITE_GOOGLE_CLIENT_ID</code> to <code className="rounded bg-amber-100 px-1">.env</code> then restart.
                </p>
              </div>
            )}

            {/* CTAs */}
            <div className="space-y-3">
              {/* Google */}
              <GoogleButton onClick={handleGoogle} loading={googleLoading} disabled={!google.isReady || anyLoading} />

              <Divider />

              {/* Passkey create */}
              <button
                onClick={() => setScreen('passkey-register')}
                disabled={anyLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}
              >
                <KeyRound className="size-4" />
                Create wallet with passkey
              </button>

              {/* Passkey sign in */}
              <button
                onClick={() => setScreen('passkey-login')}
                disabled={anyLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'white', color: '#1d2f50', border: '1px solid #e2e8f0' }}
              >
                <Fingerprint className="size-4" />
                Sign in with passkey
              </button>

              {/* Google error */}
              {google.error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3" style={{ border: '1px solid rgba(220,38,38,0.15)' }}>
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{google.error}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Passkey register / login ─────────────────────────────── */}
        {(screen === 'passkey-register' || screen === 'passkey-login') && (
          <motion.div key={screen}
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
            transition={spring}
            className="flex flex-1 flex-col px-5 pt-6 pb-10"
          >
            {/* Form card */}
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
              <div className="h-1" style={{ background: spectral }} />
              <div className="p-6">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl"
                  style={{ background: screen === 'passkey-register' ? '#eff6ff' : '#f5f3ff' }}>
                  {screen === 'passkey-register'
                    ? <KeyRound className="size-6 text-blue-600" />
                    : <Fingerprint className="size-6 text-violet-600" />}
                </div>

                <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk',sans-serif" }}>
                  {screen === 'passkey-register' ? 'Create your wallet' : 'Welcome back'}
                </h2>
                <p className="mt-1 text-sm text-slate-400 text-pretty">
                  {screen === 'passkey-register'
                    ? 'Your passkey is tied to this device. No seed phrases needed.'
                    : 'Use your passkey to access your USDC wallet.'}
                </p>

                {screen === 'passkey-register' && (
                  <div className="mt-5">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Display name (optional)
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRegister() }}
                      placeholder="e.g. Alice"
                      disabled={passkeyLoading}
                      className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: '#f8faff' }}
                      autoFocus
                    />
                  </div>
                )}

                {/* Error */}
                <AnimatePresence>
                  {auth.error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3" style={{ border: '1px solid rgba(220,38,38,0.15)' }}>
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                        <p className="text-xs text-red-600">{auth.error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={screen === 'passkey-register' ? handleRegister : handleLogin}
                  disabled={passkeyLoading}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}
                >
                  {passkeyLoading ? (
                    <><Loader2 className="size-4 animate-spin" />{auth.status === 'registering' ? 'Creating passkey...' : 'Signing in...'}</>
                  ) : (
                    <>
                      {screen === 'passkey-register' ? <KeyRound className="size-4" /> : <Fingerprint className="size-4" />}
                      {screen === 'passkey-register' ? 'Create passkey & wallet' : 'Sign in with passkey'}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>

                <button
                  onClick={() => setScreen(screen === 'passkey-register' ? 'passkey-login' : 'passkey-register')}
                  className="mt-3 w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  {screen === 'passkey-register' ? 'Already have a wallet? Sign in' : "Don't have a wallet? Create one"}
                </button>
              </div>
            </div>

            {/* Trust note */}
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-green-500" />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Passkeys are domain-bound</p>
                <p className="mt-0.5 text-xs text-slate-400 text-pretty">
                  Your credential is cryptographically tied to this app's domain and cannot be phished or reused elsewhere.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
