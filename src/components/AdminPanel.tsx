/**
 * AdminPanel — slide-up sheet restricted to wallet 0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9.
 * Admin can:
 *  1. Switch active network (Arc Testnet / Arc Mainnet)
 *  2. Toggle payment method visibility (PayPal, Card, Venmo, etc.)
 *  3. Toggle feature visibility for all dashboard features
 *  4. Toggle Connected Accounts (OpenPay) section
 *  5. Toggle Support link in Profile
 *
 * Other wallets see a "Not authorised" message; non-connected users see a connect prompt.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X, ShieldCheck, AlertTriangle, Check, ChevronRight, CreditCard,
  ShieldOff, Layers,
} from 'lucide-react'
import {
  useNetwork, type NetworkMode,
  ALL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethodKey,
  ALL_FEATURES, FEATURE_LABELS, type FeatureFlagKey,
} from '@/NetworkContext'
import OUSDIcon from '@/components/OUSDIcon'

// ─── Constants ───────────────────────────────────────────────────────────────

const ADMIN_WALLET = '0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9'.toLowerCase()
const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const springs = { sheet: { type: 'spring', damping: 32, stiffness: 300 } }

const glass = {
  card: {
    background: 'rgba(255,255,255,0.64)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.68)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200"
      style={{ background: on ? 'var(--accent)' : 'rgba(18,45,69,0.15)' }}
      aria-label={on ? 'Disable' : 'Enable'}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="absolute size-5 rounded-full bg-white shadow"
        style={{ left: on ? 'calc(100% - 1.35rem)' : '2px' }}
      />
    </button>
  )
}

function MethodIcon({ k }: { k: PaymentMethodKey }) {
  if (k === 'paypal')    return <img src="https://www.paypalobjects.com/webstatic/icon/pp258.png" alt="" className="size-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
  if (k === 'card')      return <CreditCard className="size-4 text-blue-600" />
  if (k === 'venmo')     return <span className="text-sm">🔵</span>
  if (k === 'applepay')  return <span className="text-sm">🍎</span>
  if (k === 'googlepay') return <span className="text-xs font-bold text-slate-600">G</span>
  if (k === 'paylater')  return <span className="text-xs font-bold text-blue-600">PAY</span>
  return null
}

// ─── Section types ───────────────────────────────────────────────────────────

type PanelSection = 'network' | 'payments' | 'features'

interface Props { open: boolean; onClose: () => void }

// ─── Main component ──────────────────────────────────────────────────────────

export default function AdminPanel({ open, onClose }: Props) {
  const { mode, chainName, setMode, paymentMethods, setPaymentMethod, features, setFeature } = useNetwork()
  const { address, isConnected } = useAccount()

  const [section, setSection]         = useState<PanelSection>('network')
  const [saved, setSaved]             = useState(false)
  const [pendingMode, setPendingMode] = useState<NetworkMode>(mode)

  // Determine admin access
  const isAdmin = isConnected && address?.toLowerCase() === ADMIN_WALLET

  const handleClose = () => {
    onClose()
    setTimeout(() => {
      setSaved(false); setPendingMode(mode); setSection('network')
    }, 300)
  }

  const handleSave = () => {
    setMode(pendingMode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const networkChanged = pendingMode !== mode
  const enabledMethodCount = ALL_PAYMENT_METHODS.filter(k => paymentMethods[k]).length
  const enabledFeatureCount = ALL_FEATURES.filter(k => features[k]).length

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', maxHeight: '92dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            {/* Rainbow strip */}
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5" style={{ color: 'var(--accent)' }} />
                  <h2 className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--ink)' }}>Admin Panel</h2>
                </div>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* ── Not connected ── */}
              {!isConnected && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <ShieldOff className="size-12 text-slate-300" />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Wallet required</p>
                    <p className="mt-1 text-xs text-slate-400">Connect the authorised admin wallet to access this panel.</p>
                  </div>
                  <ConnectKitButton />
                </div>
              )}

              {/* ── Connected but not admin ── */}
              {isConnected && !isAdmin && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#fef2f2' }}>
                    <ShieldOff className="size-7 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-600">Not authorised</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Admin access is restricted to a specific wallet.<br />
                      Connected: <span className="font-mono">{address?.slice(0,8)}…{address?.slice(-4)}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* ── Admin panel ── */}
              {isAdmin && (
                <div className="space-y-4">
                  {/* Section tabs */}
                  <div className="grid grid-cols-3 gap-1 rounded-2xl p-1" style={{ background: 'rgba(18,45,69,0.06)' }}>
                    {([
                      { id: 'network' as PanelSection,  label: 'Network' },
                      { id: 'payments' as PanelSection, label: `Pay (${enabledMethodCount})` },
                      { id: 'features' as PanelSection, label: `Features (${enabledFeatureCount})` },
                    ]).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSection(s.id)}
                        className="rounded-xl py-2 text-xs font-semibold transition-all"
                        style={section === s.id
                          ? { background: 'white', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                          : { color: 'var(--muted)' }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* ── Network section ── */}
                  {section === 'network' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={glass.inner}>
                        <div className="size-2 rounded-full" style={{ background: mode === 'testnet' ? 'var(--accent-hover)' : 'var(--success)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                          Active: <span className="font-bold">{chainName}</span>
                        </span>
                      </div>

                      <div className="rounded-2xl" style={glass.card}>
                        <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Select Network</p>
                        <div className="mt-2 space-y-1 px-2 pb-2">
                          {(['testnet', 'mainnet'] as NetworkMode[]).map(net => {
                            const selected = pendingMode === net
                            return (
                              <button
                                key={net}
                                onClick={() => { setPendingMode(net); setSaved(false) }}
                                className="flex w-full items-center justify-between rounded-xl px-3 py-3 transition-all hover:bg-white/60 active:scale-[0.98]"
                                style={selected ? { background: 'rgba(18,45,69,0.07)' } : {}}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="size-2.5 rounded-full" style={{ background: net === 'testnet' ? 'var(--accent-hover)' : 'var(--success)' }} />
                                  <div className="text-left">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{net === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'}</p>
                                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{net === 'testnet' ? 'Chain ID 5042002 — test USDC' : 'Chain ID 5042 — real USDC'}</p>
                                  </div>
                                </div>
                                {selected ? <Check className="size-4" style={{ color: 'var(--accent)' }} /> : <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {pendingMode === 'mainnet' && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          className="flex gap-3 rounded-2xl p-4"
                          style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.18)' }}>
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>
                            Mainnet uses <strong>real USDC</strong>. Transactions are irreversible.
                          </p>
                        </motion.div>
                      )}

                      <button
                        disabled={!networkChanged && !saved}
                        onClick={handleSave}
                        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: saved ? 'var(--success)' : 'var(--accent)' }}
                      >
                        {saved
                          ? <span className="flex items-center justify-center gap-2"><Check className="size-4" /> Saved</span>
                          : networkChanged
                            ? `Switch to ${pendingMode === 'mainnet' ? 'Arc Mainnet' : 'Arc Testnet'}`
                            : 'No changes'}
                      </button>
                    </div>
                  )}

                  {/* ── Payment Methods section ── */}
                  {section === 'payments' && (
                    <div className="space-y-3">
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Toggle which payment methods appear in the Buy USDC fiat flow.
                      </p>
                      <div className="rounded-2xl" style={glass.card}>
                        <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Payment Methods</p>
                        <div className="mt-2 divide-y divide-black/5 px-4 pb-2">
                          {ALL_PAYMENT_METHODS.map(key => {
                            const { label, sub } = PAYMENT_METHOD_LABELS[key]
                            const enabled = paymentMethods[key]
                            return (
                              <div key={key} className="flex items-center gap-3 py-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full"
                                  style={{ background: enabled ? 'rgba(29,47,80,0.07)' : 'rgba(0,0,0,0.04)', opacity: enabled ? 1 : 0.45 }}>
                                  <MethodIcon k={key} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold" style={{ color: enabled ? 'var(--ink)' : 'var(--muted)' }}>{label}</p>
                                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>
                                </div>
                                <Toggle on={enabled} onToggle={() => setPaymentMethod(key, !enabled)} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {enabledMethodCount === 0 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="flex gap-3 rounded-2xl p-3"
                          style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                          <p className="text-xs" style={{ color: 'var(--danger)' }}>All payment methods disabled — users can't buy USDC via fiat.</p>
                        </motion.div>
                      )}
                      <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>Changes apply immediately and persist across sessions.</p>
                    </div>
                  )}

                  {/* ── Features section ── */}
                  {section === 'features' && (
                    <div className="space-y-3">
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        Show or hide any feature across the dashboard. Hidden features disappear from all UI surfaces immediately.
                      </p>

                      {/* Quick bulk actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => ALL_FEATURES.forEach(k => setFeature(k, true))}
                          className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all hover:opacity-80"
                          style={{ background: '#dcfce7', color: '#16a34a' }}
                        >
                          Enable all
                        </button>
                        <button
                          onClick={() => ALL_FEATURES.forEach(k => setFeature(k, false))}
                          className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all hover:opacity-80"
                          style={{ background: '#fee2e2', color: '#dc2626' }}
                        >
                          Hide all
                        </button>
                      </div>

                      {/* OUSD master switch — pinned at top */}
                      <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #0D47D1', background: features.ousd ? '#E8EFFE' : '#f8f8f8' }}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="shrink-0 opacity-100">
                            <OUSDIcon size={36} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold" style={{ color: '#0D47D1' }}>OpenPay OpenUSD (OUSD)</p>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>
                              {features.ousd
                                ? 'Visible — balance, swap, send/receive shown'
                                : 'Hidden — all OUSD removed from mainnet & testnet'}
                            </p>
                          </div>
                          <Toggle on={features.ousd} onToggle={() => setFeature('ousd', !features.ousd)} />
                        </div>
                        {!features.ousd && (
                          <div className="flex gap-2 border-t px-4 py-2.5" style={{ borderColor: '#C5D5F8', background: '#FEF3C7' }}>
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                            <p className="text-xs text-amber-700">OUSD balance row, swap sheet, send option, info sheet and More-tab entry are all hidden.</p>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl" style={glass.card}>
                        <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                          All Features
                        </p>
                        <div className="mt-2 divide-y divide-black/5 px-4 pb-2">
                          {(ALL_FEATURES.filter(k => k !== 'ousd') as FeatureFlagKey[]).map(key => {
                            const { label, sub } = FEATURE_LABELS[key]
                            const enabled = features[key]
                            return (
                              <div key={key} className="flex items-center gap-3 py-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full"
                                  style={{ background: enabled ? 'rgba(29,47,80,0.07)' : 'rgba(0,0,0,0.04)', opacity: enabled ? 1 : 0.45 }}>
                                  <Layers className="size-4" style={{ color: enabled ? 'var(--accent)' : 'var(--subtle)' }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold" style={{ color: enabled ? 'var(--ink)' : 'var(--muted)' }}>{label}</p>
                                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>
                                </div>
                                <Toggle on={enabled} onToggle={() => setFeature(key, !enabled)} />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
                        Changes apply immediately and persist across sessions.
                      </p>
                    </div>
                  )}

                  {/* Admin identity badge */}
                  <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 mt-2"
                    style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.12)' }}>
                    <ShieldCheck className="size-4 shrink-0 text-blue-500" />
                    <p className="font-mono text-[10px] text-blue-600 truncate">
                      Admin: {address?.slice(0, 10)}…{address?.slice(-6)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
