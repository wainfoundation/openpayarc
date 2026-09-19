/**
 * AdminPanel — slide-up sheet gated by a 4-digit PIN.
 * Admin can switch the active network between Arc Testnet and Arc Mainnet.
 *
 * Default PIN: 1234  (admin should change it via VITE_ADMIN_PIN in .env)
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ShieldCheck, AlertTriangle, Check, ChevronRight } from 'lucide-react'
import { useNetwork, type NetworkMode } from '@/NetworkContext'

const ADMIN_PIN: string = (import.meta.env.VITE_ADMIN_PIN as string | undefined) ?? '1234'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

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

const springs = { sheet: { type: 'spring', damping: 32, stiffness: 300 } }

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'pin' | 'panel'

const PIN_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export default function AdminPanel({ open, onClose }: Props) {
  const { mode, chainName, setMode } = useNetwork()
  const [step, setStep] = useState<Step>('pin')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pendingMode, setPendingMode] = useState<NetworkMode>(mode)

  const handleClose = () => {
    onClose()
    // reset after exit animation
    setTimeout(() => {
      setStep('pin')
      setPin('')
      setPinError(false)
      setSaved(false)
      setPendingMode(mode)
    }, 300)
  }

  const handleDigit = (d: string) => {
    if (d === 'del') {
      setPin((p) => p.slice(0, -1))
      setPinError(false)
      return
    }
    if (d === '') return
    const next = pin + d
    setPin(next)
    setPinError(false)
    if (next.length === 4) {
      if (next === ADMIN_PIN) {
        setTimeout(() => { setStep('panel'); setPin('') }, 160)
      } else {
        setTimeout(() => { setPinError(true); setPin('') }, 160)
      }
    }
  }

  const handleSave = () => {
    setMode(pendingMode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const networkChanged = pendingMode !== mode

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5" style={{ color: 'var(--accent)' }} />
                  <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Admin</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="flex size-8 items-center justify-center rounded-full"
                  style={{ background: 'var(--surface-muted)' }}
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* ── PIN entry ── */}
              {step === 'pin' && (
                <div className="space-y-5">
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Enter your 4-digit admin PIN to continue.</p>

                  {/* PIN dots */}
                  <div className="flex justify-center gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        animate={pinError ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                        transition={{ duration: 0.35 }}
                        className="size-4 rounded-full transition-colors"
                        style={{
                          background: pin.length > i
                            ? (pinError ? 'var(--danger)' : 'var(--accent)')
                            : 'rgba(18,45,69,0.12)',
                        }}
                      />
                    ))}
                  </div>

                  {pinError && (
                    <p className="text-center text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                      Incorrect PIN. Try again.
                    </p>
                  )}

                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-2">
                    {PIN_DIGITS.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => handleDigit(d)}
                        disabled={d === '' || pin.length >= 4}
                        className="flex h-14 items-center justify-center rounded-2xl text-lg font-semibold transition-all hover:scale-[1.04] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-0"
                        style={glass.inner}
                      >
                        <span style={{ color: 'var(--ink)' }}>
                          {d === 'del' ? '⌫' : d}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
                    Default PIN is 1234. Set <span className="mono font-semibold">VITE_ADMIN_PIN</span> in .env to change it.
                  </p>
                </div>
              )}

              {/* ── Admin panel ── */}
              {step === 'panel' && (
                <div className="space-y-4">
                  {/* Current network badge */}
                  <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={glass.inner}>
                    <div
                      className="size-2 rounded-full"
                      style={{ background: mode === 'testnet' ? 'var(--accent-hover)' : 'var(--success)' }}
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Active: <span className="font-bold">{chainName}</span>
                    </span>
                  </div>

                  {/* Network selector */}
                  <div className="rounded-2xl" style={glass.card}>
                    <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                      Network
                    </p>
                    <div className="mt-2 space-y-1 px-2 pb-2">
                      {(['testnet', 'mainnet'] as NetworkMode[]).map((net) => {
                        const selected = pendingMode === net
                        return (
                          <button
                            key={net}
                            onClick={() => { setPendingMode(net); setSaved(false) }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-3 transition-all hover:bg-white/60 active:scale-[0.98]"
                            style={selected ? { background: 'rgba(18,45,69,0.07)' } : {}}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="size-2.5 rounded-full"
                                style={{ background: net === 'testnet' ? 'var(--accent-hover)' : 'var(--success)' }}
                              />
                              <div className="text-left">
                                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                                  {net === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                                  {net === 'testnet' ? 'Chain ID 5042002 — test USDC' : 'Chain ID 5042 — real USDC'}
                                </p>
                              </div>
                            </div>
                            {selected
                              ? <Check className="size-4" style={{ color: 'var(--accent)' }} />
                              : <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
                            }
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Mainnet warning */}
                  {pendingMode === 'mainnet' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3 rounded-2xl p-4"
                      style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.18)' }}
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>
                        Mainnet uses <strong>real USDC</strong>. Transactions are irreversible. Make sure you intend to use real funds before saving.
                      </p>
                    </motion.div>
                  )}

                  {/* Save button */}
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
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
