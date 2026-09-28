import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, ExternalLink, AlertCircle, Shield } from 'lucide-react'
import { useNetwork } from '@/NetworkContext'

interface Props { open: boolean; onClose: () => void }

export default function USYCSheet({ open, onClose }: Props) {
  const { isTestnet, chainName } = useNetwork()

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="relative z-50 w-full max-w-[480px] rounded-t-3xl pb-safe"
            style={{ background: 'var(--surface,white)', maxHeight: '90dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-2 pt-4" style={{ background: 'var(--surface,white)' }}>
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
              <div className="flex items-center gap-3 pt-3">
                <div className="flex size-10 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#064e3b,#10b981)' }}>
                  <TrendingUp className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>USYC — Yield</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Tokenized T-Bill yield on Arc</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-4 py-4 pb-8">
              {/* Hero */}
              <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#064e3b,#10b981)' }}>
                <p className="text-sm text-emerald-200">USYC — US Yield Coin</p>
                <p className="mt-1 text-2xl font-bold text-white">~5% APY</p>
                <p className="mt-1 text-xs text-emerald-100">T-Bill backed yield token. Hold USYC to earn US Treasury yield onchain. No lockup.</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                {[['Backing', 'US T-Bills'], ['Issuer', 'Hashnote'], ['Standard', 'ERC-20']].map(([k, v]) => (
                  <div key={k} className="flex flex-col items-center rounded-xl py-3" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{v}</p>
                    <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{k}</p>
                  </div>
                ))}
              </div>

              {/* How it works */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                <p className="mb-3 text-sm font-bold" style={{ color: 'var(--ink)' }}>How USYC works</p>
                {[
                  ['Deposit USDC', 'Swap USDC into USYC via Teller contract'],
                  ['Earn T-Bill yield', 'USYC price appreciates as US Treasury yield accrues'],
                  ['Redeem anytime', 'Swap USYC back to USDC with no lockup period'],
                ].map(([title, desc], i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: '#10b981' }}>{i + 1}</div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{title}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* KYC notice */}
              <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#ECFDF5', border: '1px solid #6EE7B7' }}>
                <Shield className="mt-0.5 size-4 shrink-0" style={{ color: '#10b981' }} />
                <p className="text-xs" style={{ color: '#065F46' }}>
                  USYC requires KYC allowlisting from Hashnote. Apply at hashnote.com to be added to the allowlist before depositing.
                </p>
              </div>

              {/* Coming soon notice */}
              <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#FFF8E1', border: '1px solid #F59E0B' }}>
                <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
                <p className="text-xs" style={{ color: '#92400E' }}>
                  In-app USYC deposit/redeem is coming soon. The Teller contract integration will be added once the Arc Teller address is confirmed.
                </p>
              </div>

              <div className="flex gap-2">
                <a href="https://hashnote.com" target="_blank" rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#064e3b,#10b981)' }}>
                  Apply for KYC <ExternalLink className="size-3.5" />
                </a>
                <a href="https://docs.arc.io" target="_blank" rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold"
                  style={{ background: 'var(--surface-2,#f1f5f9)', color: 'var(--ink)' }}>
                  Arc Docs <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
