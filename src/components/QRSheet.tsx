/**
 * QRSheet — two tabs:
 *  "My QR"  — real scannable QR code of your wallet address (via qrcode lib)
 *  "Scan"   — live camera scanner (via @zxing/browser) with graceful
 *              fallback to paste-an-address when camera is unavailable
 */
import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Copy, Check, ArrowRight, Camera, CameraOff, Loader2, AlertTriangle, ClipboardPaste } from 'lucide-react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { useQRCode } from '@/hooks/useQRCode'
import { useQRScanner } from '@/hooks/useQRScanner'

const springs = { sheet: { type: 'spring' as const, damping: 32, stiffness: 300 } }

interface Props {
  open: boolean
  onClose: () => void
  onSendTo?: (address: string) => void
}

// ─── Real QR display ──────────────────────────────────────────────────────────

function QRDisplay({ data }: { data: string }) {
  const { canvasRef, ready, error } = useQRCode(data, 176)

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-2xl shadow-sm"
      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', width: 176, height: 176 }}
    >
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 className="size-6 text-slate-300 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <p className="px-3 text-center text-xs text-red-400">{error}</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: ready ? 'block' : 'none', width: 176, height: 176 }}
      />
    </div>
  )
}

// ─── Camera scanner ───────────────────────────────────────────────────────────

function CameraScanner({ onScanned }: { onScanned: (addr: string) => void }) {
  const [pasteAddr, setPasteAddr] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [scannedRaw, setScannedRaw] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleRawResult = (text: string) => {
    setScannedRaw(text)
    // Accept plain 0x address or ethereum: URI
    let addr = text.trim()
    if (addr.startsWith('ethereum:')) addr = addr.slice(9).split('@')[0].split('?')[0]
    if (isAddress(addr)) {
      onScanned(addr)
    } else {
      setParseError(`Scanned "${text.slice(0, 30)}…" — not a wallet address.`)
    }
  }

  const { state, errorMsg, videoRef, start, stop } = useQRScanner(handleRawResult)

  // Auto-start when component mounts
  useEffect(() => {
    start()
    return () => { stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pasteValid = isAddress(pasteAddr.trim())

  const handlePasteSubmit = () => {
    if (!pasteValid) return
    onScanned(pasteAddr.trim())
  }

  return (
    <div className="space-y-4">
      {/* Camera viewport */}
      <div
        className="relative mx-auto overflow-hidden rounded-2xl bg-slate-900"
        style={{ width: '100%', maxWidth: 320, aspectRatio: '1 / 1' }}
      >
        {/* Video element — always mounted so the ref is ready */}
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          style={{ display: state === 'scanning' ? 'block' : 'none' }}
          muted
          playsInline
        />

        {/* Scanning overlay */}
        {state === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Finder corners */}
            <div className="relative size-48">
              {(['tl','tr','bl','br'] as const).map(c => (
                <span
                  key={c}
                  className="absolute size-8 border-white"
                  style={{
                    borderTopWidth: c.startsWith('t') ? 3 : 0,
                    borderBottomWidth: c.startsWith('b') ? 3 : 0,
                    borderLeftWidth: c.endsWith('l') ? 3 : 0,
                    borderRightWidth: c.endsWith('r') ? 3 : 0,
                    top: c.startsWith('t') ? 0 : 'auto',
                    bottom: c.startsWith('b') ? 0 : 'auto',
                    left: c.endsWith('l') ? 0 : 'auto',
                    right: c.endsWith('r') ? 0 : 'auto',
                    borderRadius: c === 'tl' ? '8px 0 0 0' : c === 'tr' ? '0 8px 0 0' : c === 'bl' ? '0 0 0 8px' : '0 0 8px 0',
                  }}
                />
              ))}
              {/* Scan line animation */}
              <motion.div
                className="absolute left-2 right-2 h-0.5 rounded-full"
                style={{ background: 'rgba(95,190,255,0.8)', top: 8 }}
                animate={{ top: [8, 180, 8] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          </div>
        )}

        {/* Requesting state */}
        {state === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 text-white animate-spin" />
            <p className="text-sm text-white/70">Requesting camera…</p>
          </div>
        )}

        {/* Idle */}
        {state === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Camera className="size-10 text-white/30" />
            <button
              onClick={start}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Start camera
            </button>
          </div>
        )}

        {/* Denied / unsupported */}
        {(state === 'denied' || state === 'unsupported' || state === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <CameraOff className="size-8 text-white/40" />
            <p className="text-xs text-white/60 leading-relaxed">{errorMsg}</p>
          </div>
        )}
      </div>

      {/* Parse error feedback */}
      {parseError && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5" style={{ border: '1px solid #fde68a' }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700">{parseError}</p>
        </div>
      )}

      {/* Scanned raw value (non-address) */}
      {scannedRaw && !isAddress(scannedRaw) && (
        <div className="rounded-2xl bg-slate-50 px-4 py-3" style={{ border: '1px solid var(--border)' }}>
          <p className="text-xs text-slate-400">Scanned value:</p>
          <p className="mono mt-0.5 break-all text-xs" style={{ color: 'var(--ink)' }}>{scannedRaw}</p>
        </div>
      )}

      {/* Paste fallback toggle */}
      <div>
        <button
          onClick={() => setShowPaste(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <ClipboardPaste className="size-4" />
          {showPaste ? 'Hide' : 'Paste address instead'}
        </button>

        <AnimatePresence>
          {showPaste && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Recipient address</label>
                  <input
                    value={pasteAddr}
                    onChange={e => setPasteAddr(e.target.value.trim())}
                    placeholder="0x..."
                    className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                  {pasteAddr && !pasteValid && (
                    <p className="mt-1 text-xs text-red-500">Not a valid Ethereum address</p>
                  )}
                </div>
                <button
                  disabled={!pasteValid}
                  onClick={handlePasteSubmit}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent)' }}
                >
                  <span className="flex items-center justify-center gap-2">
                    Send to this address <ArrowRight className="size-4" />
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export default function QRSheet({ open, onClose, onSendTo }: Props) {
  const { address } = useAccount()
  const [tab, setTab] = useState<'show' | 'scan'>('show')
  const [copied, setCopied] = useState(false)

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  const handleScanned = (addr: string) => {
    if (onSendTo) {
      onSendTo(addr)
    }
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '92vh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>QR Pay</h2>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {/* Tab switcher */}
              <div className="mb-5 flex rounded-2xl bg-slate-100 p-1">
                {(['show', 'scan'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
                    style={tab === t
                      ? { background: 'white', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                      : { color: 'var(--muted)' }}
                  >
                    {t === 'show' ? 'My QR Code' : 'Scan to Pay'}
                  </button>
                ))}
              </div>

              {tab === 'show' ? (
                <div className="space-y-4 text-center">
                  {address ? (
                    <>
                      <QRDisplay data={address} />
                      <div>
                        <p className="text-xs font-semibold text-slate-400">Scan to send USDC to this wallet</p>
                        <p className="mono mt-1 text-xs break-all px-4" style={{ color: 'var(--ink)' }}>
                          {address}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={copyAddress}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: copied ? '#dcfce7' : '#eff6ff', color: copied ? '#16a34a' : '#2563eb' }}
                        >
                          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                          {copied ? 'Copied!' : 'Copy address'}
                        </button>
                        <button
                          onClick={() => setTab('scan')}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ background: 'var(--accent)' }}
                        >
                          Pay someone
                          <ArrowRight className="size-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-10 text-center">
                      <TokenUSDC variant="branded" size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm text-slate-400">Connect your wallet to show your QR code</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Camera scanner tab — only mount when tab is active to avoid background camera usage */
                <CameraScanner onScanned={handleScanned} />
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
