import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Copy, Check, ArrowDownToLine, SendHorizonal, Share2 } from 'lucide-react'
import { useState } from 'react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useNetwork } from '@/NetworkContext'
import type { TxRecord } from '@/components/ActivityFeed'

interface Props {
  tx: TxRecord | null
  onClose: () => void
}

function fmt(addr: string) {
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`
}

export default function TxReceiptModal({ tx, onClose }: Props) {
  const { chainId, chainName } = useNetwork()
  const [copied, setCopied] = useState<'hash' | 'from' | 'to' | null>(null)

  const copy = (text: string, key: 'hash' | 'from' | 'to') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    }).catch(() => undefined)
  }

  const explorerUrl = tx ? buildTxExplorerUrl(chainId, tx.hash) : null

  const share = () => {
    if (!tx || !explorerUrl) return
    const text = `${tx.direction === 'sent' ? 'Sent' : 'Received'} $${tx.amount} USDC on OpenPay Arc\n${explorerUrl}`
    if (navigator.share) {
      navigator.share({ title: 'OpenPay Arc Transaction', text, url: explorerUrl }).catch(() => undefined)
    } else {
      navigator.clipboard.writeText(text).catch(() => undefined)
    }
  }

  const date = tx ? new Date(tx.timestamp) : null
  const isSent = tx?.direction === 'sent'

  return (
    <AnimatePresence>
      {tx && (
        <>
          {/* Backdrop */}
          <motion.div
            key="receipt-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Modal — centered */}
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
          <motion.div
            key="receipt-modal"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white pointer-events-auto"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.22)', maxHeight: '90dvh', overflowY: 'auto' }}
          >
            {/* Spectral strip */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Transaction Receipt</h2>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200">
                <X className="size-4" />
              </button>
            </div>

            {/* Status badge */}
            <div className="flex flex-col items-center px-5 pb-4 pt-3">
              <div
                className="flex size-16 items-center justify-center rounded-full"
                style={{ background: isSent ? '#fee2e2' : '#dcfce7' }}
              >
                {isSent
                  ? <SendHorizonal className="size-7 text-red-500" />
                  : <ArrowDownToLine className="size-7 text-green-600" />
                }
              </div>
              <div className="mt-3 text-center">
                <p className="text-3xl font-bold tabular-nums" style={{ color: isSent ? '#dc2626' : '#16a34a' }}>
                  {isSent ? '-' : '+'}${tx.amount}
                </p>
                <p className="text-sm font-semibold text-slate-400">USDC</p>
              </div>
              <span
                className="mt-2 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider"
                style={{ background: '#dcfce7', color: '#16a34a' }}
              >
                Confirmed
              </span>
            </div>

            {/* Divider */}
            <div className="mx-5 border-t" style={{ borderColor: 'var(--border)' }} />

            {/* Details */}
            <div className="space-y-0 px-5 py-3">
              {/* Date */}
              <Row label="Date">
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {date?.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </Row>

              {/* Type */}
              <Row label="Type">
                <span className="text-sm font-semibold capitalize" style={{ color: 'var(--ink)' }}>
                  {tx.direction === 'sent' ? 'Sent USDC' : 'Received USDC'}
                </span>
              </Row>

              {/* Network */}
              <Row label="Network">
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{chainName}</span>
              </Row>

              {/* From / To */}
              {tx.direction === 'sent' ? (
                <Row label="To">
                  <button
                    onClick={() => copy(tx.counterparty, 'to')}
                    className="flex items-center gap-1.5 font-mono text-xs font-semibold"
                    style={{ color: '#2563eb' }}
                  >
                    {fmt(tx.counterparty)}
                    {copied === 'to' ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </button>
                </Row>
              ) : (
                <Row label="From">
                  <button
                    onClick={() => copy(tx.counterparty, 'from')}
                    className="flex items-center gap-1.5 font-mono text-xs font-semibold"
                    style={{ color: '#2563eb' }}
                  >
                    {fmt(tx.counterparty)}
                    {copied === 'from' ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </button>
                </Row>
              )}

              {/* Memo */}
              {tx.memo && (
                <Row label="Memo">
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{tx.memo}</span>
                </Row>
              )}

              {/* Tx Hash */}
              <Row label="Tx Hash">
                <button
                  onClick={() => copy(tx.hash, 'hash')}
                  className="flex items-center gap-1.5 font-mono text-xs font-semibold"
                  style={{ color: '#2563eb' }}
                >
                  {tx.hash.slice(0, 12)}...{tx.hash.slice(-8)}
                  {copied === 'hash' ? <Check className="size-3" /> : <Copy className="size-3" />}
                </button>
              </Row>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-5 pb-6 pt-2">
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                >
                  <ExternalLink className="size-4" />
                  View on Explorer
                </a>
              )}
              <button
                onClick={share}
                className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'var(--accent)' }}
              >
                <Share2 className="size-4" />
                Share
              </button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </div>
  )
}
