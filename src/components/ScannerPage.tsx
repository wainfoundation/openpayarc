/**
 * ScannerPage — full-screen QR scanner matching the iOS dark camera UI.
 * Three modes: Camera (live), Photo (paste a data URL or upload), Paste (type address).
 * Dark full-bleed background, large finder frame with corner brackets and sweep line,
 * header with back / reset / help, wallet brand row at top.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RotateCcw, HelpCircle, CheckCircle, AlertTriangle, Upload } from 'lucide-react'
import { isAddress } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { useQRScanner } from '@/hooks/useQRScanner'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanTab = 'camera' | 'photo' | 'paste'

interface Props {
  open: boolean
  onClose: () => void
  onSendTo: (address: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAddress(raw: string): string | null {
  let addr = raw.trim()
  // ethereum: URI  — e.g. ethereum:0xAbCd...?value=1
  if (addr.startsWith('ethereum:')) addr = addr.slice(9).split('@')[0].split('?')[0]
  // EIP-681  — e.g. ethereum:0x.../transfer?...
  addr = addr.split('/')[0]
  return isAddress(addr) ? addr : null
}

// ─── Finder frame overlay ─────────────────────────────────────────────────────

function FinderFrame({ scanning }: { scanning: boolean }) {
  // Corner brackets: 4 corners × 2 arms (horizontal + vertical)
  const corners: { x: 'left' | 'right'; y: 'top' | 'bottom' }[] = [
    { x: 'left', y: 'top' }, { x: 'right', y: 'top' },
    { x: 'left', y: 'bottom' }, { x: 'right', y: 'bottom' },
  ]

  return (
    <div className="relative" style={{ width: 260, height: 260 }}>
      {/* Dark mask — top */}
      {/* (the parent handles the full overlay; we just draw the frame here) */}

      {/* Corner brackets */}
      {corners.map(({ x, y }) => (
        <div
          key={`${x}-${y}`}
          className="absolute"
          style={{
            [x]: 0,
            [y]: 0,
            width: 36,
            height: 36,
            borderColor: '#4f8ef7',
            borderTopWidth: y === 'top' ? 3 : 0,
            borderBottomWidth: y === 'bottom' ? 3 : 0,
            borderLeftWidth: x === 'left' ? 3 : 0,
            borderRightWidth: x === 'right' ? 3 : 0,
            borderRadius:
              y === 'top' && x === 'left' ? '8px 0 0 0'
              : y === 'top' && x === 'right' ? '0 8px 0 0'
              : y === 'bottom' && x === 'left' ? '0 0 0 8px'
              : '0 0 8px 0',
          }}
        />
      ))}

      {/* Animated sweep line */}
      {scanning && (
        <motion.div
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            height: 2,
            borderRadius: 2,
            background: 'linear-gradient(90deg, transparent, #4f8ef7, transparent)',
            boxShadow: '0 0 8px 2px rgba(79,142,247,0.5)',
            top: 4,
          }}
          animate={{ top: [4, 250, 4] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  )
}

// ─── Camera tab ───────────────────────────────────────────────────────────────

function CameraTab({ onScanned }: { onScanned: (raw: string) => void }) {
  const { state, errorMsg, videoRef, start, stop } = useQRScanner(onScanned)

  useEffect(() => {
    start()
    return () => { stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = state === 'scanning' || state === 'requesting'

  return (
    <div className="flex flex-1 flex-col items-center justify-between">
      {/* Camera viewport — full width, fills available space */}
      <div className="relative flex flex-1 w-full items-center justify-center overflow-hidden">
        {/* Live video behind everything */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 size-full object-cover"
          style={{ display: isActive ? 'block' : 'none' }}
        />

        {/* Dark overlay with transparent centre cutout (via box-shadow) */}
        {isActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'transparent',
              boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.55)',
            }}
          />
        )}

        {/* Dark fallback when camera not active */}
        {!isActive && <div className="absolute inset-0 bg-black" />}

        {/* Finder frame centred */}
        <div className="relative z-10">
          <FinderFrame scanning={state === 'scanning'} />
        </div>

        {/* State overlays */}
        {state === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-20">
            <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/60">Requesting camera…</p>
          </div>
        )}

        {(state === 'denied' || state === 'unsupported' || state === 'error') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center z-20">
            <AlertTriangle className="size-10 text-amber-400" />
            <p className="text-sm leading-relaxed text-white/70">{errorMsg}</p>
            <button
              onClick={start}
              className="rounded-2xl px-6 py-2.5 text-sm font-semibold text-white"
              style={{ background: '#4f8ef7' }}
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div className="pb-8 pt-6 text-center">
        <p className="text-base font-bold text-white">Position the code inside the frame</p>
        <p className="mt-1 text-sm text-white/50">Point at a QR code — keep it inside the frame.</p>
      </div>
    </div>
  )
}

// ─── Photo tab ────────────────────────────────────────────────────────────────

function PhotoTab({ onScanned }: { onScanned: (raw: string) => void }) {
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'processing' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setStatus('processing')
    setErrMsg('')
    try {
      // Draw to canvas and attempt decode via @zxing/browser
      const url = URL.createObjectURL(file)
      const img = new Image()
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url })
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)

      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      interface CanvasReader { decodeFromCanvas(canvas: HTMLCanvasElement): Promise<{ getText(): string }> }
      const reader = new BrowserMultiFormatReader() as unknown as CanvasReader
      const result = await reader.decodeFromCanvas(canvas)
      onScanned(result.getText())
    } catch {
      setStatus('error')
      setErrMsg('No QR code found in this image. Try a clearer photo.')
    }
  }, [onScanned])

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    void processFile(files[0])
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className="flex w-full cursor-pointer flex-col items-center gap-4 rounded-3xl border-2 border-dashed py-12 transition-colors"
        style={{ borderColor: dragging ? '#4f8ef7' : 'rgba(255,255,255,0.15)', background: dragging ? 'rgba(79,142,247,0.1)' : 'rgba(255,255,255,0.04)' }}
      >
        <Upload className="size-10 text-white/30" />
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Upload a QR code image</p>
          <p className="mt-1 text-xs text-white/40">Tap to browse or drag and drop</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {status === 'processing' && (
        <div className="flex items-center gap-3">
          <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/60">Scanning image…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle className="size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{errMsg}</p>
        </div>
      )}

      <p className="text-center text-xs text-white/30">
        Supports PNG, JPG, WebP. The image is processed locally — nothing is uploaded.
      </p>
    </div>
  )
}

// ─── Paste tab ────────────────────────────────────────────────────────────────

function PasteTab({ onScanned }: { onScanned: (raw: string) => void }) {
  const [value, setValue] = useState('')
  const valid = isAddress(value.trim()) || value.trim().startsWith('ethereum:')

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 px-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">Wallet address or payment link</p>
        <div
          className="overflow-hidden rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0x… or ethereum:0x…"
            rows={3}
            className="mono w-full resize-none bg-transparent px-4 pt-4 pb-3 text-sm text-white outline-none placeholder:text-white/20"
          />
        </div>
        {value && !valid && (
          <p className="mt-1.5 text-xs text-red-400">Not a valid Ethereum address or payment link</p>
        )}
      </div>

      <button
        disabled={!valid}
        onClick={() => { if (valid) onScanned(value.trim()) }}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-30"
        style={{ background: valid ? '#4f8ef7' : 'rgba(255,255,255,0.1)' }}
      >
        Continue
      </button>

      <p className="text-center text-xs text-white/25">
        Paste any 0x address, OpenPay Arc link, or ethereum: URI.
      </p>
    </div>
  )
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function ScannerPage({ open, onClose, onSendTo }: Props) {
  const [tab, setTab] = useState<ScanTab>('camera')
  const [result, setResult] = useState<{ addr: string; raw: string } | null>(null)

  // Reset state is handled by the `key={open}` on the inner div (unmount/remount)

  const handleScanned = useCallback((raw: string) => {
    const addr = extractAddress(raw)
    if (addr) {
      setResult({ addr, raw })
    } else {
      setResult({ addr: '', raw })
    }
  }, [])

  const handleConfirm = () => {
    if (result?.addr) {
      onSendTo(result.addr)
      onClose()
    }
  }

  const handleReset = () => { setResult(null); setTab('camera') }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scanner-page"
          className="fixed inset-0 z-[60] flex flex-col bg-black"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        >
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-12">
            <button
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <ArrowLeft className="size-5 text-white" />
            </button>

            <h1 className="text-base font-bold text-white">Scan QR Code</h1>

            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex size-9 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <RotateCcw className="size-4 text-white/70" />
              </button>
              <button
                className="flex size-9 items-center justify-center rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <HelpCircle className="size-4 text-white/70" />
              </button>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div className="mx-4 mb-4 shrink-0 overflow-hidden rounded-2xl" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <div className="flex p-1">
              {(['camera', 'photo', 'paste'] as ScanTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setResult(null) }}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-all"
                  style={tab === t
                    ? { background: 'white', color: '#111' }
                    : { color: 'rgba(255,255,255,0.5)' }}
                >
                  {t === 'paste' ? 'Paste' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Wallet brand row ── */}
          <div className="shrink-0 px-4 pb-4">
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <TokenUSDC variant="branded" size={18} />
                <span className="text-xs font-semibold text-white/70">OpenPay Arc</span>
              </div>
              <span className="text-white/20">·</span>
              <span className="text-xs text-white/40">Universal USDC payments</span>
            </div>
          </div>

          {/* ── Content area ── */}
          {result ? (
            /* Scan result confirmation */
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-12">
              {result.addr ? (
                <>
                  <div className="flex size-20 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle className="size-10 text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">Address scanned</p>
                    <p className="mono mt-2 break-all text-xs text-white/50">{result.addr}</p>
                  </div>
                  <button
                    onClick={handleConfirm}
                    className="w-full rounded-2xl py-4 text-sm font-bold text-white"
                    style={{ background: '#4f8ef7' }}
                  >
                    Send USDC to this address
                  </button>
                  <button onClick={handleReset} className="text-sm text-white/40">
                    Scan again
                  </button>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-12 text-amber-400" />
                  <div className="text-center">
                    <p className="text-base font-bold text-white">Not a wallet address</p>
                    <p className="mono mt-2 break-all text-xs text-white/40">{result.raw.slice(0, 80)}</p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="w-full rounded-2xl py-4 text-sm font-bold text-white"
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {tab === 'camera' && <CameraTab onScanned={handleScanned} />}
              {tab === 'photo' && <PhotoTab onScanned={handleScanned} />}
              {tab === 'paste' && <PasteTab onScanned={handleScanned} />}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
