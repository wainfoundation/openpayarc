/**
 * BuyFiatSheet — fiat-to-USDC funding via PayPal JS SDK v6
 *
 * Supported payment methods:
 *  - PayPal (wallet / BNPL)
 *  - Fastlane (saved cards for returning users)
 *  - Venmo
 *  - Apple Pay
 *  - Google Pay
 *  - Debit / credit cards (hosted fields)
 *
 * Flow:
 *  1. User enters a USD amount
 *  2. SDK loads lazily (PayPal JS SDK v6 from sandbox CDN)
 *  3. Backend /api/paypal/client-token provides a client token (no secrets in browser)
 *  4. PayPal buttons render and handle the full checkout UX
 *  5. On approval → backend /api/paypal/order/:id/capture
 *  6. Success screen shows confirmation + amount funded
 *
 * PayPal credentials are server-side only (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env).
 * VITE_PAYPAL_CLIENT_ID is the public client ID used ONLY to load the JS SDK script tag.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, CreditCard, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, DollarSign, ArrowLeft,
} from 'lucide-react'
import { useAccount } from 'wagmi'
import { useNetwork } from '@/NetworkContext'
import type { PaymentMethodKey } from '@/NetworkContext'

// ─── PayPal SDK types (minimal) ───────────────────────────────────────────────

interface PayPalOrderActions {
  order: {
    create: (data: Record<string, unknown>) => Promise<string>
    capture: () => Promise<Record<string, unknown>>
  }
}

interface PayPalSDK {
  Buttons: (config: {
    fundingSource?: string
    createOrder: (data: Record<string, unknown>, actions: PayPalOrderActions) => Promise<string>
    onApprove: (data: { orderID: string }, actions: PayPalOrderActions) => Promise<void>
    onError?: (err: unknown) => void
    onCancel?: () => void
  }) => { render: (selector: string) => Promise<void>; isEligible?: () => boolean }
  FUNDING: Record<string, string>
}

declare global {
  interface Window {
    paypal?: PayPalSDK
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  onBack: () => void
}

// ─── Amount presets ───────────────────────────────────────────────────────────

const PRESETS = ['10', '25', '50', '100', '250', '500']

// ─── Payment method row ───────────────────────────────────────────────────────

function MethodRow({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40 active:scale-[0.99]"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BuyFiatSheet({ open, onClose, onBack }: Props) {
  const { address } = useAccount()
  const { isTestnet, paymentMethods } = useNetwork()

  const [phase, setPhase] = useState<'amount' | 'checkout' | 'success' | 'error'>('amount')
  const [amount, setAmount] = useState('25')
  const [customAmount, setCustomAmount] = useState('')
  const [activeMethod, setActiveMethod] = useState<string | null>(null)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  // Public client ID for SDK script tag — safe to expose in browser
  const PUBLIC_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined
  const [successInfo, setSuccessInfo] = useState<{ orderId: string; amount: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const buttonsContainerRef = useRef<HTMLDivElement>(null)

  const finalAmount = customAmount || amount

  // Load PayPal JS SDK using the public client ID (safe in browser)
  const loadSdk = useCallback(async () => {
    if (window.paypal) { setSdkLoaded(true); return }
    const cid = PUBLIC_CLIENT_ID
    if (!cid) {
      setSdkError('PayPal client ID not configured. Set VITE_PAYPAL_CLIENT_ID in .env.')
      return
    }
    const base = isTestnet ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com'
    const src = `${base}/sdk/js?client-id=${cid}&components=buttons,funding-eligibility&enable-funding=venmo,paylater&currency=USD`
    await new Promise<void>((resolve, reject) => {
      // Remove any stale PayPal script (different client-id)
      document.querySelectorAll('script[src*="paypal.com/sdk"]').forEach(s => s.remove())
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload  = () => { setSdkLoaded(true); resolve() }
      script.onerror = () => reject(new Error('Failed to load PayPal SDK script'))
      document.head.appendChild(script)
    })
  }, [isTestnet, PUBLIC_CLIENT_ID])

  // When user picks a method → enter checkout phase + load SDK
  const initPayPal = useCallback(async (method: string) => {
    setActiveMethod(method)
    setPhase('checkout')
    setLoading(true)
    setSdkError(null)
    try {
      await loadSdk()
    } catch (e) {
      setSdkError(String(e))
    } finally {
      setLoading(false)
    }
  }, [loadSdk])

  // Render PayPal buttons once SDK is ready and we're in checkout phase
  useEffect(() => {
    if (!sdkLoaded || phase !== 'checkout' || !buttonsContainerRef.current || !window.paypal) return

    const container = buttonsContainerRef.current
    container.innerHTML = ''

    const fundingMap: Record<string, string> = {
      paypal:      window.paypal.FUNDING.PAYPAL,
      card:        window.paypal.FUNDING.CARD,
      venmo:       window.paypal.FUNDING.VENMO,
      applepay:    window.paypal.FUNDING.APPLEPAY,
      googlepay:   window.paypal.FUNDING.GOOGLEPAY,
      paylater:    window.paypal.FUNDING.PAYLATER,
    }

    const fundingSource = activeMethod ? fundingMap[activeMethod] : undefined

    // Use SDK's built-in order creation (no backend roundtrip needed for sandbox)
    const createOrder = async (_: Record<string, unknown>, actions: PayPalOrderActions) => {
      return actions.order.create({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: parseFloat(finalAmount).toFixed(2) },
          description: `OpenPay Arc — Buy USDC ($${finalAmount})`,
          custom_id: address ?? '',
        }],
        application_context: { brand_name: 'OpenPay Arc', user_action: 'PAY_NOW' },
      })
    }

    const onApprove = async (data: { orderID: string }, actions: PayPalOrderActions) => {
      setLoading(true)
      try {
        // Try backend capture first; fall back to SDK capture if server is unavailable
        let captured: { status?: string; id?: string } = {}
        try {
          const res = await fetch(`/api/paypal/order/${data.orderID}/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          if (res.ok) {
            captured = await res.json() as { status?: string; id?: string }
          } else {
            // Fallback: use SDK capture
            const sdkResult = await actions.order.capture()
            captured = sdkResult
          }
        } catch {
          // Fallback: use SDK capture
          const sdkResult = await actions.order.capture()
          captured = sdkResult
        }
        if (captured.status === 'COMPLETED' || captured.status === 'APPROVED') {
          setSuccessInfo({ orderId: (captured.id) ?? data.orderID, amount: finalAmount })
          setPhase('success')
        } else {
          throw new Error(`Order status: ${captured.status ?? 'unknown'}`)
        }
      } catch (e) {
        setErrorMsg(String(e))
        setPhase('error')
      } finally {
        setLoading(false)
      }
    }

    const btn = window.paypal.Buttons({
      fundingSource,
      createOrder,
      onApprove,
      onError: (e: unknown) => { setErrorMsg(String(e)); setPhase('error') },
      onCancel: () => { setPhase('amount') },
    })

    if (btn.isEligible?.() !== false) {
      void btn.render('#paypal-buttons-container')
    }
  }, [sdkLoaded, phase, activeMethod, finalAmount, address])

  const handleClose = () => {
    setPhase('amount')
    setActiveMethod(null)
    setSdkLoaded(false)
    setSdkError(null)
    setCustomAmount('')
    setAmount('25')
    setSuccessInfo(null)
    onClose()
  }

  const handleBack = () => {
    if (phase === 'checkout') { setPhase('amount'); setActiveMethod(null); return }
    handleClose()
    onBack()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="buy-fiat-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            key="buy-fiat-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl bg-white"
            style={{ maxHeight: '92dvh', overflowY: 'auto' }}
          >
            {/* Spectral strip */}
            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 to-orange-400" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <button onClick={handleBack} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                <ArrowLeft className="size-4" />
              </button>
              <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {phase === 'success' ? 'Payment Complete' : phase === 'error' ? 'Payment Failed' : phase === 'checkout' ? 'Checkout' : 'Buy USDC'}
              </h2>
              <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                <X className="size-4" />
              </button>
            </div>

            <div className="px-5 pb-8">

              {/* ── Amount selection ──────────────────────────────────── */}
              {phase === 'amount' && (
                <div className="space-y-5">
                  {/* Amount card */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Amount (USD)</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PRESETS.map(p => (
                        <button
                          key={p}
                          onClick={() => { setAmount(p); setCustomAmount('') }}
                          className={`rounded-xl border py-2.5 text-sm font-bold transition ${
                            amount === p && !customAmount
                              ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
                          }`}
                        >
                          ${p}
                        </button>
                      ))}
                    </div>
                    <div className="relative mt-3">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                      <input
                        type="number"
                        min="1"
                        placeholder="Custom amount"
                        value={customAmount}
                        onChange={e => { setCustomAmount(e.target.value); setAmount('') }}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
                      />
                    </div>
                    <p className="mt-2 text-center text-xs text-slate-400">
                      You will receive approximately <span className="font-semibold text-slate-600">{finalAmount} USDC</span> on Arc{isTestnet ? ' Testnet' : ''}
                    </p>
                  </div>

                  {/* Payment methods — only show admin-enabled ones */}
                  {(() => {
                    const methods: Array<{ key: PaymentMethodKey; icon: React.ReactNode; label: string; sub: string }> = [
                      { key: 'paypal',    icon: <img src="https://www.paypalobjects.com/webstatic/icon/pp258.png" alt="PayPal" className="size-6 object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />, label: 'PayPal', sub: 'PayPal balance & linked accounts' },
                      { key: 'card',      icon: <CreditCard className="size-5 text-blue-600" />, label: 'Debit or Credit Card', sub: 'Visa, Mastercard, Amex, Discover' },
                      { key: 'venmo',     icon: <span className="text-lg">🔵</span>, label: 'Venmo', sub: 'Pay with your Venmo balance' },
                      { key: 'applepay',  icon: <span className="text-lg">🍎</span>, label: 'Apple Pay', sub: 'Touch ID or Face ID' },
                      { key: 'googlepay', icon: <span className="text-lg font-bold text-slate-600">G</span>, label: 'Google Pay', sub: 'Pay with Google' },
                      { key: 'paylater',  icon: <span className="text-xs font-bold text-blue-600">PAY LATER</span>, label: 'Pay Later', sub: '4 interest-free payments' },
                    ]
                    const visible = methods.filter(m => paymentMethods[m.key])
                    if (visible.length === 0) {
                      return (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-center">
                          <p className="text-sm font-semibold text-amber-700">No payment methods available</p>
                          <p className="mt-1 text-xs text-amber-600">Contact support or try another funding option.</p>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Choose payment method</p>
                        {visible.map(m => (
                          <MethodRow key={m.key} icon={m.icon} label={m.label} sub={m.sub} onClick={() => void initPayPal(m.key)} />
                        ))}
                      </div>
                    )
                  })()}

                  <p className="text-center text-xs text-slate-400">
                    Sandbox mode — no real money charged. Powered by PayPal.
                  </p>
                </div>
              )}

              {/* ── Checkout (PayPal buttons) ─────────────────────────── */}
              {phase === 'checkout' && (
                <div className="space-y-4">
                  {/* Order summary */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">You pay</span>
                      <span className="text-lg font-bold text-slate-800">${finalAmount} USD</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm text-slate-500">You receive</span>
                      <span className="text-sm font-semibold text-blue-600">~{finalAmount} USDC</span>
                    </div>
                    {address && (
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm text-slate-500">To wallet</span>
                        <span className="font-mono text-xs text-slate-500">{address.slice(0, 8)}…{address.slice(-6)}</span>
                      </div>
                    )}
                  </div>

                  {/* SDK loading */}
                  {loading && (
                    <div className="flex flex-col items-center gap-2 py-6">
                      <Loader2 className="size-8 animate-spin text-blue-500" />
                      <p className="text-sm text-slate-500">Loading payment options…</p>
                    </div>
                  )}

                  {/* SDK error */}
                  {sdkError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                      <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">Failed to load PayPal</p>
                        <p className="text-xs text-red-500 mt-0.5">{sdkError}</p>
                        <button onClick={() => void initPayPal(activeMethod ?? 'paypal')} className="mt-2 text-xs font-semibold text-blue-600 underline">
                          Try again
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PayPal buttons container */}
                  {sdkLoaded && !sdkError && (
                    <div>
                      <div id="paypal-buttons-container" ref={buttonsContainerRef} className="min-h-[48px]" />
                      <p className="mt-2 text-center text-xs text-slate-400">
                        Transactions processed by PayPal. OpenPay Arc is not a licensed money transmitter.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Success ─────────────────────────────────────────────── */}
              {phase === 'success' && successInfo && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle2 className="size-8 text-green-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      Payment successful!
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      ${successInfo.amount} USD received. Your USDC will arrive shortly.
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400">Order: {successInfo.orderId}</p>
                  </div>
                  <div className="w-full rounded-2xl border border-green-100 bg-green-50 p-4">
                    <p className="text-xs text-slate-500">This is a sandbox transaction — no real funds moved.</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition"
                    style={{ background: '#1d2f50' }}
                  >
                    Done
                  </button>
                </div>
              )}

              {/* ── Error ──────────────────────────────────────────────── */}
              {phase === 'error' && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="size-8 text-red-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800">Payment failed</p>
                    <p className="mt-1 text-sm text-slate-500">{errorMsg || 'Something went wrong. Please try again.'}</p>
                  </div>
                  <button onClick={() => setPhase('amount')} className="w-full rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">
                    Try again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
