import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Globe, ExternalLink, AlertCircle, Layers } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useNetwork } from '@/NetworkContext'

const CHAINS = [
  { name: 'Arc', color: '#1d2f50', testnet: 'Arc Testnet', mainnet: 'Arc Mainnet', logo: '◎' },
  { name: 'Ethereum', color: '#627EEA', testnet: 'Sepolia', mainnet: 'Mainnet', logo: 'Ξ' },
  { name: 'Base', color: '#0052FF', testnet: 'Base Sepolia', mainnet: 'Base', logo: 'B' },
  { name: 'Arbitrum', color: '#28A0F0', testnet: 'Arb Sepolia', mainnet: 'Arbitrum One', logo: 'A' },
  { name: 'Polygon', color: '#8247E5', testnet: 'Amoy', mainnet: 'Polygon', logo: '⬡' },
  { name: 'Optimism', color: '#FF0420', testnet: 'OP Sepolia', mainnet: 'Optimism', logo: 'O' },
  { name: 'Avalanche', color: '#E84142', testnet: 'Fuji', mainnet: 'Avalanche', logo: '▲' },
  { name: 'Solana', color: '#9945FF', testnet: 'Devnet', mainnet: 'Mainnet', logo: '◉' },
]

interface Props { open: boolean; onClose: () => void }

export default function UnifiedBalanceSheet({ open, onClose }: Props) {
  const { isTestnet } = useNetwork()
  const { address } = useAccount()
  const [tab, setTab] = useState<'overview' | 'deposit' | 'spend'>('overview')

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
                <div className="flex size-10 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
                  <Layers className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Unified Balance</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>USDC across all chains</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="mx-4 mt-3 flex rounded-xl p-1" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
              {(['overview', 'deposit', 'spend'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-all"
                  style={{ background: tab === t ? 'white' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--muted)', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4 px-4 py-4">
              {tab === 'overview' && (
                <>
                  <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
                    <p className="text-sm text-blue-200">What is Unified Balance?</p>
                    <p className="mt-1 text-base font-bold text-white">One USDC balance, all chains</p>
                    <p className="mt-2 text-xs text-blue-100">Circle Gateway pools your USDC from Ethereum, Base, Arbitrum, Polygon, Arc and more into a single spendable balance. No manual bridging required.</p>
                  </div>

                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Supported chains</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CHAINS.map(c => (
                      <div key={c.name} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: c.color }}>
                          {c.logo}
                        </div>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{c.name}</p>
                          <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{isTestnet ? c.testnet : c.mainnet}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <a href="https://docs.arc.io/app-kit/unified-balance" target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white"
                    style={{ background: '#1d2f50' }}>
                    Read Unified Balance Docs <ExternalLink className="size-4" />
                  </a>
                </>
              )}

              {(tab === 'deposit' || tab === 'spend') && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#EFF6FF' }}>
                    <Globe className="size-7" style={{ color: '#2563eb' }} />
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: 'var(--ink)' }}>Coming soon</p>
                    <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                      {tab === 'deposit' ? 'Deposit USDC from any chain into your unified balance.' : 'Spend your unified USDC balance on any chain without bridging.'}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Powered by Circle Gateway + App Kit</p>
                  </div>
                  <a href="https://docs.arc.io/app-kit/unified-balance" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: '#1d2f50' }}>
                    Learn more <ExternalLink className="size-4" />
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
