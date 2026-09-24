/**
 * ReceiveSheet — shows your wallet address + a real scannable QR code.
 * Optional amount + memo to generate a prefilled payment link (also as a QR).
 */
import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Copy, Check, Link, QrCode, Loader2, ChevronDown } from 'lucide-react'
import { useAccount } from 'wagmi'
import { TokenUSDC } from '@web3icons/react'
import OUSDIcon from './OUSDIcon'
import { useQRCode } from '@/hooks/useQRCode'

type ReceiveToken = 'USDC' | 'OUSD'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const springs = { sheet: { type: 'spring' as const, damping: 32, stiffness: 300 } }

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// ─── Inline QR panel ──────────────────────────────────────────────────────────

function QRPanel({ data, label }: { data: string; label: string }) {
  const { canvasRef, ready, error } = useQRCode(data, 160)

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="relative overflow-hidden rounded-2xl shadow-sm"
        style={{ background: 'white', border: '1px solid rgba(0,0,0,0.07)', width: 160, height: 160 }}>
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Loader2 className="size-6 animate-spin text-slate-300" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50">
            <p className="px-3 text-center text-xs text-red-400">{error}</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: ready ? 'block' : 'none', width: 160, height: 160 }}
        />
      </div>
      <p className="max-w-[200px] truncate text-center text-xs text-slate-400">{label}</p>
    </div>
  )
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export default function ReceiveSheet({ open, onClose }: Props) {
  const { address } = useAccount()
  const [requestAmount, setRequestAmount] = useState('')
  const [requestMemo, setRequestMemo] = useState('')
  const [copiedAddr, setCopiedAddr] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [qrView, setQrView] = useState<'address' | 'link'>('address')
  const [receiveToken, setReceiveToken] = useState<ReceiveToken>('USDC')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)

  const paymentLink = address
    ? (() => {
        const params = new URLSearchParams({ to: address })
        if (requestAmount) params.set('amount', requestAmount)
        if (requestMemo) params.set('memo', requestMemo)
        if (receiveToken === 'OUSD') params.set('token', 'OUSD')
        return `${window.location.origin}?${params.toString()}`
      })()
    : ''

  const hasPaymentDetails = !!(requestAmount || requestMemo)

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddr(true)
      setTimeout(() => setCopiedAddr(false), 2000)
    }).catch(() => undefined)
  }

  const copyLink = () => {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }).catch(() => undefined)
  }

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
            style={{ maxHeight: '92vh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1 shrink-0" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Receive</h2>
                  {/* Token selector */}
                  <div className="relative">
                    <button
                      onClick={() => setTokenMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-sm font-bold transition-colors hover:opacity-80"
                      style={receiveToken === 'OUSD'
                        ? { background: '#e8eeff', color: '#0D47D1', border: '1px solid #c0d0ff' }
                        : { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                    >
                      {receiveToken === 'USDC'
                        ? <TokenUSDC variant="branded" size={14} />
                        : <OUSDIcon size={14} />
                      }
                      {receiveToken}
                      <ChevronDown className="size-3 opacity-60" />
                    </button>
                    {tokenMenuOpen && (
                      <div className="absolute left-0 top-full z-10 mt-1 w-24 overflow-hidden rounded-xl bg-white shadow-lg" style={{ border: '1px solid var(--border)' }}>
                        {(['USDC', 'OUSD'] as ReceiveToken[]).map(t => (
                          <button key={t} onClick={() => { setReceiveToken(t); setTokenMenuOpen(false) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                            style={{ color: t === receiveToken ? 'var(--accent)' : 'var(--ink)' }}>
                            {t === 'USDC'
                              ? <TokenUSDC variant="branded" size={13} />
                              : <OUSDIcon size={14} />
                            }
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-full bg-slate-100"
                >
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {address ? (
                <div className="space-y-4">
                  {/* QR toggle */}
                  {hasPaymentDetails && (
                    <div className="flex rounded-2xl bg-slate-100 p-1">
                      {(['address', 'link'] as const).map(v => (
                        <button
                          key={v}
                          onClick={() => setQrView(v)}
                          className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
                          style={qrView === v
                            ? { background: 'white', color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                            : { color: 'var(--muted)' }}
                        >
                          {v === 'address' ? 'Address QR' : 'Payment QR'}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* QR code display */}
                  <div
                    className="rounded-2xl bg-slate-50 py-4"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <QRPanel
                      data={qrView === 'link' && hasPaymentDetails ? paymentLink : address}
                      label={qrView === 'link' && hasPaymentDetails
                        ? (requestAmount ? `Request $${requestAmount} ${receiveToken}` : 'Payment request')
                        : formatAddress(address)}
                    />
                  </div>

                  {/* Address row */}
                  <div
                    className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full"
                      style={{ background: receiveToken === 'OUSD' ? '#e8eeff' : '#eff6ff' }}>
                      {receiveToken === 'USDC'
                        ? <TokenUSDC variant="branded" size={18} />
                        : <OUSDIcon size={20} />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your address</p>
                      <p className="mono mt-0.5 truncate text-xs" style={{ color: 'var(--ink)' }}>{address}</p>
                    </div>
                    <button
                      onClick={copyAddress}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
                      style={{ background: copiedAddr ? '#dcfce7' : '#eff6ff', color: copiedAddr ? '#16a34a' : '#2563eb' }}
                    >
                      {copiedAddr ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </button>
                  </div>

                  {/* Payment details (optional) */}
                  <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Request amount (optional)
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-slate-300">$</span>
                      <input
                        inputMode="decimal"
                        value={requestAmount}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setRequestAmount(v)
                        }}
                        placeholder="0.00"
                        className="min-w-0 flex-1 bg-transparent text-xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                        style={{ color: 'var(--ink)' }}
                      />
                      <span className="text-sm font-semibold text-slate-400">{receiveToken}</span>
                    </div>
                    <input
                      value={requestMemo}
                      onChange={e => setRequestMemo(e.target.value)}
                      placeholder="For (optional note)"
                      className="mt-2 w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={copyAddress}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: '#eff6ff', color: '#2563eb' }}
                    >
                      <Copy className="size-4" />
                      Copy address
                    </button>
                    <button
                      onClick={copyLink}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: copiedLink ? '#16a34a' : 'var(--accent)' }}
                    >
                      {copiedLink ? <Check className="size-4" /> : <Link className="size-4" />}
                      {copiedLink ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>

                  {/* QR hint */}
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                    <QrCode className="size-3.5" />
                    {hasPaymentDetails ? 'Switch tabs above to show a payment-prefilled QR' : 'Enter an amount above to generate a payment QR'}
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <TokenUSDC variant="branded" size={44} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm text-slate-400">Connect your wallet to receive {receiveToken}</p>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
