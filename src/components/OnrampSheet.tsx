/**
 * OnrampSheet — Arc App Kit Onramp integration
 *
 * Two modes (auto-detected at runtime):
 *
 * MODE A — Full SDK (when @circle-fin/onramp-kit is installed + ONRAMP_KIT_KEY set):
 *   1. POST /api/onramp/sessions → get a short-lived session from your server
 *   2. createOnrampKit().mountIframe() embeds the Circle-hosted widget inline
 *   3. Lifecycle events (DEPOSIT_SUBMITTED, DEPOSIT_SETTLED) update the UI
 *
 * MODE B — Hosted redirect (fallback when SDK unavailable / key not set):
 *   Opens https://onramp.arc.io in an iframe with ?address=… pre-filled.
 *   No KYC is bypassed — users complete the full Circle onramp flow on Arc's domain.
 *
 * ONRAMP_KIT_KEY is kept server-side only (never in a VITE_ var).
 * The public VITE_ONRAMP_WIDGET_URL is optional (defaults to https://onramp.arc.io).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useNetwork } from '@/NetworkContext'
import type { OnrampSession, OnrampDepositInfo as DepositInfo } from '@circle-fin/onramp-kit'

const spectral = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'
const WIDGET_BASE = (import.meta.env.VITE_ONRAMP_WIDGET_URL as string | undefined) ?? 'https://onramp.arc.io'

// Dynamic import — works whether or not the kit is configured for full mode
async function tryLoadKit(): Promise<typeof import('@circle-fin/onramp-kit').createOnrampKit | null> {
  try {
    const mod = await import('@circle-fin/onramp-kit')
    return mod.createOnrampKit ?? null
  } catch {
    return null
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onBack: () => void
}

type Phase = 'loading' | 'widget' | 'success' | 'error' | 'fallback'

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnrampSheet({ open, onClose, onBack }: Props) {
  const { address } = useAccount()
  const { isTestnet } = useNetwork()

  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null)
  const [widgetReady, setWidgetReady] = useState(false)
  const [session, setSession] = useState<OnrampSession | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<{ close: () => void } | null>(null)
  const creditedRef = useRef(false)

  const fallbackUrl = `${WIDGET_BASE}?address=${encodeURIComponent(address ?? '')}&chain=${isTestnet ? 'arc-testnet' : 'arc'}`

  const mountWidget = useCallback(async (sess: OnrampSession) => {
    const createOnrampKit = await tryLoadKit()
    if (!createOnrampKit || !containerRef.current) {
      // Kit unavailable → show hosted fallback iframe
      setPhase('fallback')
      return
    }
    const kit = createOnrampKit({ widgetBaseUrl: WIDGET_BASE })
    creditedRef.current = false
    widgetRef.current = kit.mountIframe({
      session: sess,
      container: containerRef.current,
      title: 'Add cash',
      onInitializationSuccess: () => setWidgetReady(true),
      onInitializationError: () => {
        setErrorMsg('Widget failed to initialize. Please try again.')
        setPhase('error')
      },
      onDepositSubmitted: (e) => {
        if (creditedRef.current) return
        creditedRef.current = true
        setDepositInfo(e.payload)
        setPhase('success')
      },
      onDepositSettled: (e) => {
        if (creditedRef.current) return
        creditedRef.current = true
        setDepositInfo(e.payload)
        setPhase('success')
      },
      onDepositNotCompleted: () => {
        // User cancelled or session timed out — go back
        setPhase('loading')
        setSession(null)
      },
    })
    setPhase('widget')
  }, [])

  const fetchSession = useCallback(async () => {
    if (!address) {
      setErrorMsg('Connect your wallet first to buy USDC.')
      setPhase('error')
      return
    }
    setPhase('loading')
    setWidgetReady(false)
    creditedRef.current = false
    try {
      const res = await fetch('/api/onramp/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: address,
          destinationAddress: address,
        }),
      })
      const data = await res.json() as OnrampSession & { error?: { name?: string; message?: string } }
      if (data.error) {
        // Key not configured → use hosted fallback
        if (data.error.name === 'server_misconfigured') {
          setPhase('fallback')
          return
        }
        throw new Error(data.error.message ?? JSON.stringify(data.error))
      }
      setSession(data)
      await mountWidget(data)
    } catch {
      // Network error (no backend) → fallback
      setPhase('fallback')
    }
  }, [address, mountWidget])

  // Fetch session when sheet opens — legitimately synchronizes with external onramp API
  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => {
    if (!open) return
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    void fetchSession()
    return () => {
      widgetRef.current?.close()
      widgetRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = () => {
    widgetRef.current?.close()
    widgetRef.current = null
    setPhase('loading')
    setSession(null)
    setDepositInfo(null)
    setWidgetReady(false)
    onClose()
  }

  const handleBack = () => {
    widgetRef.current?.close()
    widgetRef.current = null
    setPhase('loading')
    setSession(null)
    handleClose()
    onBack()
  }

  const title = phase === 'success' ? 'Payment Complete'
    : phase === 'error' ? 'Error'
    : phase === 'fallback' ? 'Arc Onramp'
    : 'Buy USDC with Fiat'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="onramp-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            key="onramp-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl bg-white"
            style={{ maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0" style={{ background: spectral }} />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
              <button onClick={handleBack} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                <ArrowLeft className="size-4" />
              </button>
              <div className="text-center">
                <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{title}</h2>
                <p className="text-xs text-slate-400">Powered by Circle · Arc</p>
              </div>
              <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">

              {/* ── Loading ── */}
              {phase === 'loading' && (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="size-10 animate-spin text-blue-500" />
                  <p className="text-sm font-medium text-slate-600">Preparing your onramp session…</p>
                  <p className="text-xs text-slate-400">This takes just a moment</p>
                </div>
              )}

              {/* ── Widget (SDK mounted) ── */}
              {phase === 'widget' && (
                <div className="relative">
                  {/* Branded loader shown until widget signals ready */}
                  {!widgetReady && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white">
                      <div className="flex size-12 items-center justify-center rounded-full bg-blue-50">
                        <Loader2 className="size-6 animate-spin text-blue-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-600">Loading Arc Onramp…</p>
                    </div>
                  )}
                  {/* Kit mounts its iframe into this div */}
                  <div
                    ref={containerRef}
                    className="w-full rounded-2xl overflow-hidden"
                    style={{ minHeight: 560 }}
                  />
                </div>
              )}

              {/* ── Fallback iframe (when kit not installed or key not set) ── */}
              {phase === 'fallback' && (
                <div className="space-y-4">
                  {/* Info card */}
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                    <p className="font-semibold mb-1">Arc Onramp — Circle Hosted</p>
                    <p className="text-xs leading-relaxed text-blue-600">
                      Buy USDC with debit card, Apple Pay, Google Pay, or bank transfer. Your wallet address is pre-filled. KYC and payment are handled securely by Circle.
                    </p>
                  </div>

                  {/* Embedded iframe */}
                  <div className="relative w-full overflow-hidden rounded-2xl border border-slate-100 shadow-sm" style={{ height: 580 }}>
                    <iframe
                      src={fallbackUrl}
                      className="w-full h-full"
                      title="Arc Onramp"
                      allow="camera; microphone; payment; clipboard-write"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
                    />
                  </div>

                  <a
                    href={fallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <ExternalLink className="size-4" />
                    Open in full browser
                  </a>

                  {/* Setup note for developers */}
                  <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
                    <p className="font-semibold mb-0.5">To enable full SDK mode:</p>
                    <p>Set <span className="font-mono">ONRAMP_KIT_KEY</span> in .env with your Circle Kit Key from <a href="https://console.circle.com/app-kits" target="_blank" rel="noopener noreferrer" className="underline">console.circle.com/app-kits</a>.</p>
                  </div>
                </div>
              )}

              {/* ── Success ── */}
              {phase === 'success' && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="size-8 text-green-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {depositInfo?.tokenSymbol ? `${depositInfo.tokenSymbol} on its way!` : 'Deposit submitted!'}
                    </p>
                    {depositInfo?.amount ? (
                      <p className="mt-1 text-2xl font-bold text-blue-600">
                        {depositInfo.amount.toLocaleString()} {depositInfo.tokenSymbol ?? 'USDC'}
                      </p>
                    ) : null}
                    {depositInfo?.paymentMethod && (
                      <p className="mt-1 text-sm text-slate-500">via {depositInfo.paymentMethod}</p>
                    )}
                  </div>
                  <div className="w-full rounded-2xl border border-green-100 bg-green-50 p-4 text-left">
                    <p className="text-xs font-semibold text-green-700 mb-1">What happens next?</p>
                    <p className="text-xs text-green-600 leading-relaxed">
                      Your USDC will arrive in your Arc wallet within a few minutes. Check your balance in the Home tab. You&apos;ll see the transaction appear in your Ledger once it settles.
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition hover:opacity-90"
                    style={{ background: '#1d2f50' }}
                  >
                    Done
                  </button>
                  <button
                    onClick={() => { setPhase('loading'); void fetchSession() }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
                  >
                    <RefreshCw className="size-3" />
                    Buy more
                  </button>
                </div>
              )}

              {/* ── Error ── */}
              {phase === 'error' && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="size-8 text-red-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800">Something went wrong</p>
                    <p className="mt-1 text-sm text-slate-500">{errorMsg || 'Could not start the onramp session.'}</p>
                  </div>
                  <button
                    onClick={() => void fetchSession()}
                    className="w-full rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => setPhase('fallback')}
                    className="text-xs text-blue-600 underline"
                  >
                    Use hosted onramp instead
                  </button>
                </div>
              )}
            </div>

            {/* Footer — session info */}
            {session && phase === 'widget' && (
              <div className="shrink-0 border-t border-slate-50 px-5 py-2 text-center">
                <p className="text-xs text-slate-400">
                  Session expires {session.expiresAt ? new Date(session.expiresAt).toLocaleTimeString() : 'shortly'} · Secured by Circle
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
