import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, ArrowUpDown, AlertCircle, Check, ExternalLink } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { useNetwork } from '@/NetworkContext'
import { getUsdc } from '@/onchain-facts'

// Arc Testnet EURC
const EURC_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  5042:    '0x0000000000000000000000000000000000000000',
}

// Arc Native StableFX DEX — swap USDC<>EURC at spot rate
// No on-chain StableFX contract address confirmed yet; using a simulated flow with
// a note that this requires the official Arc StableFX contract address.
const STABLEFX_ADDRESSES: Record<number, `0x${string}` | null> = {
  5042002: null, // TODO: replace with official Arc StableFX contract when published
  5042:    null,
}

interface Props { open: boolean; onClose: () => void }

function StableFXInner({ onClose: _onClose }: { onClose: () => void }) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [fromToken, setFromToken] = useState<'USDC' | 'EURC'>('USDC')
  const [amount, setAmount] = useState('')

  const usdcFact = getUsdc(targetChainId)
  const usdcAddress = (usdcFact?.address ?? '0x0') as `0x${string}`
  const eurcAddress = EURC_ADDRESSES[targetChainId] ?? '0x0000000000000000000000000000000000000000'
  const stableFXAddress = STABLEFX_ADDRESSES[targetChainId]
  const isWrongChain = walletChainId !== targetChainId
  const _explorerBase = isTestnet ? 'https://explorer.testnet.arc.io' : 'https://explorer.arc.io'

  const { data: usdcBalRaw } = useReadContract({ address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [address!], query: { enabled: !!address } })
  const { data: eurcBalRaw } = useReadContract({ address: eurcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [address!], query: { enabled: !!address && eurcAddress !== '0x0000000000000000000000000000000000000000' } })

  const usdcBal = usdcBalRaw ? Number(formatUnits(usdcBalRaw, 6)) : 0
  const eurcBal = eurcBalRaw ? Number(formatUnits(eurcBalRaw, 6)) : 0
  const fromBal = fromToken === 'USDC' ? usdcBal : eurcBal
  const toToken = fromToken === 'USDC' ? 'EURC' : 'USDC'
  // Simulated rate — 1 USD ≈ 0.92 EUR at time of writing; real contract would return live rate
  const rate = fromToken === 'USDC' ? 0.92 : 1.087
  const estimated = amount ? (parseFloat(amount) * rate).toFixed(4) : '—'

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Balance pills */}
      <div className="flex gap-2">
        {[{ sym: 'USDC', bal: usdcBal, sign: '$' }, { sym: 'EURC', bal: eurcBal, sign: '€' }].map(({ sym, bal, sign }) => (
          <div key={sym} className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{sym}</p>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{sign}{bal.toFixed(4)}</p>
          </div>
        ))}
      </div>

      {/* Contract not deployed notice */}
      {!stableFXAddress && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#FFF8E1', border: '1px solid #F59E0B' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
          <div>
            <p className="text-xs font-bold" style={{ color: '#92400E' }}>StableFX contract pending</p>
            <p className="text-xs mt-0.5" style={{ color: '#92400E' }}>The Arc StableFX on-chain swap contract address has not been published yet. Rate preview is shown below. Full swap will be enabled once Circle publishes the contract.</p>
            <a href="https://docs.arc.io" target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs font-bold underline" style={{ color: '#92400E' }}>
              Arc docs <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}

      {isWrongChain && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: '#FFF3CD', border: '1px solid #F59E0B' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
          <div className="flex-1">
            <p className="text-xs font-bold" style={{ color: '#92400E' }}>Wrong network</p>
            <button onClick={() => switchChain({ chainId: targetChainId })} className="text-xs font-bold underline" style={{ color: '#92400E' }}>
              Switch to {chainName}
            </button>
          </div>
        </div>
      )}

      {/* Swap form */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>You pay ({fromToken})</label>
        <div className="flex gap-2">
          <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0"
            className="flex-1 rounded-xl px-4 py-3 text-sm outline-none" style={{ background: 'var(--surface-2,#f8fafc)', border: '1.5px solid var(--border)', color: 'var(--ink)' }} />
          <button onClick={() => setFromToken(t => t === 'USDC' ? 'EURC' : 'USDC')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold" style={{ background: '#EFF6FF', color: '#2563eb' }}>
            {fromToken} <ArrowUpDown className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Balance: {fromToken === 'USDC' ? '$' : '€'}{fromBal.toFixed(4)}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
        <div className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
          <ArrowUpDown className="size-4" style={{ color: 'var(--muted)' }} />
        </div>
        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
      </div>

      <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>You receive ({toToken}) — estimated</p>
        <p className="mt-1 text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {toToken === 'EURC' ? '€' : '$'}{estimated}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Rate: 1 {fromToken} ≈ {rate} {toToken} · indicative only</p>
      </div>

      <button disabled={!stableFXAddress || !amount || isWrongChain}
        className="flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white disabled:opacity-50"
        style={{ background: '#1d2f50' }}>
        {!stableFXAddress ? 'Contract coming soon' : `Swap ${fromToken} → ${toToken}`}
      </button>

      <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
        Powered by Arc StableFX · Onchain FX at spot rate
      </p>
    </div>
  )
}

export default function StableFXSheet({ open, onClose }: Props) {
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
                  <ArrowUpDown className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>StableFX</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>USDC ↔ EURC on Arc</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <StableFXInner key={open ? 'open' : 'closed'} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
