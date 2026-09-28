import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, ExternalLink, Copy, Check, AlertCircle } from 'lucide-react'
import { useAccount, useChainId } from 'wagmi'
import { useNetwork } from '@/NetworkContext'

// ERC-8004 Identity Registry on Arc Testnet
const IDENTITY_REGISTRY = '0x5f95e38a69b3A9b3C4dDA0Fe617E4Cdf20AB2B0e' as const

interface Props { open: boolean; onClose: () => void }

export default function AgentSheet({ open, onClose }: Props) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
  const { address } = useAccount()
  const [tab, setTab] = useState<'overview' | 'identity' | 'jobs'>('overview')
  const [copied, setCopied] = useState(false)

  const explorerBase = isTestnet ? 'https://explorer.testnet.arc.io' : 'https://explorer.arc.io'

  const copyRegistry = () => {
    navigator.clipboard.writeText(IDENTITY_REGISTRY).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="relative z-50 w-full max-w-[480px] rounded-t-3xl pb-safe"
            style={{ background: 'var(--surface,white)', maxHeight: '90dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-2 pt-4" style={{ background: 'var(--surface,white)' }}>
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
              <div className="flex items-center gap-3 pt-3">
                <div className="flex size-10 items-center justify-center rounded-full" style={{ background: 'linear-gradient(135deg,#6d28d9,#2563eb)' }}>
                  <Bot className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Agent Economy</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>ERC-8004 identity · ERC-8183 jobs</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            {/* Tabs */}
            <div className="mx-4 mt-3 flex rounded-xl p-1" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
              {(['overview', 'identity', 'jobs'] as const).map(t => (
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
                  {/* Hero */}
                  <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,#6d28d9,#2563eb)' }}>
                    <p className="text-lg font-bold text-white">Arc Agent Economy</p>
                    <p className="mt-1 text-sm text-purple-100">Arc is purpose-built as the payment rail for the agentic economy. AI agents pay each other for services using USDC on Arc.</p>
                  </div>

                  {/* Standards */}
                  {[
                    { name: 'ERC-8004', title: 'Agent Identity', desc: 'On-chain identity and service registration for AI agents. Agents register a wallet, capabilities, and pricing. Discoverable by other agents and apps.', link: 'https://docs.arc.io/build/erc-8004' },
                    { name: 'ERC-8183', title: 'Agent Jobs', desc: 'On-chain job marketplace. Agents post tasks with USDC escrow. Service providers pick up jobs, deliver results, and claim payment — all trustlessly.', link: 'https://docs.arc.io/build/erc-8183' },
                    { name: 'x402', title: 'HTTP 402 Payments', desc: 'Standard for machine-to-machine micropayments. Agents call APIs that return HTTP 402, pay automatically with USDC, and retry — no human in the loop.', link: 'https://docs.arc.io/build/x402' },
                  ].map(s => (
                    <div key={s.name} className="rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg,#6d28d9,#2563eb)' }}>{s.name}</span>
                        <a href={s.link} target="_blank" rel="noreferrer"><ExternalLink className="size-4" style={{ color: 'var(--muted)' }} /></a>
                      </div>
                      <p className="mt-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>{s.title}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{s.desc}</p>
                    </div>
                  ))}
                </>
              )}

              {tab === 'identity' && (
                <>
                  <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Identity Registry (ERC-8004)</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>The canonical Arc Testnet identity registry. Register your wallet as an agent identity to be discoverable on Arc.</p>
                    <div className="mt-3 flex items-center gap-2">
                      <p className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--ink)' }}>{IDENTITY_REGISTRY}</p>
                      <button onClick={copyRegistry}>
                        {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" style={{ color: 'var(--muted)' }} />}
                      </button>
                      <a href={`${explorerBase}/address/${IDENTITY_REGISTRY}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" style={{ color: 'var(--muted)' }} />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#F3E8FF', border: '1px solid #C4B5FD' }}>
                    <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#7C3AED' }} />
                    <p className="text-xs" style={{ color: '#5B21B6' }}>
                      In-app agent registration is coming soon. To register now, interact with the registry contract directly via Arc Explorer or use the Arc Agent SDK.
                    </p>
                  </div>

                  <a href="https://docs.arc.io/build/erc-8004" target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#6d28d9,#2563eb)' }}>
                    Read ERC-8004 Docs <ExternalLink className="size-4" />
                  </a>
                </>
              )}

              {tab === 'jobs' && (
                <>
                  <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>ERC-8183 Job Marketplace</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Post tasks with USDC escrow. Service agents complete jobs and claim payment. Full trustless settlement on Arc.</p>
                  </div>

                  <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#F3E8FF', border: '1px solid #C4B5FD' }}>
                    <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#7C3AED' }} />
                    <p className="text-xs" style={{ color: '#5B21B6' }}>
                      In-app job posting is coming soon. To post or pick up jobs now, interact with the ERC-8183 contract on Arc Testnet directly or via the Arc Agent Marketplace.
                    </p>
                  </div>

                  <a href="https://agents.circle.com" target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#6d28d9,#2563eb)' }}>
                    Open Arc Agent Marketplace <ExternalLink className="size-4" />
                  </a>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
