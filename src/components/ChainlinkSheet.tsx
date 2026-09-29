import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { useNetwork } from '@/NetworkContext'

// Chainlink price feeds on Arc Mainnet (chain 5042)
// Source: https://docs.arc.io/build/chainlink-price-feeds
const CHAINLINK_FEEDS: Record<string, { address: `0x${string}`; decimals: number; name: string; pair: string }> = {
  BTC_USD:  { address: '0x0000000000000000000000000000000000000000', decimals: 8, name: 'Bitcoin', pair: 'BTC/USD' },
  ETH_USD:  { address: '0x0000000000000000000000000000000000000000', decimals: 8, name: 'Ethereum', pair: 'ETH/USD' },
  SOL_USD:  { address: '0x0000000000000000000000000000000000000000', decimals: 8, name: 'Solana', pair: 'SOL/USD' },
  USDC_USD: { address: '0x0000000000000000000000000000000000000000', decimals: 8, name: 'USD Coin', pair: 'USDC/USD' },
}
// NOTE: Replace 0x0000... above with real Arc Mainnet Chainlink feed addresses from docs.arc.io/build/chainlink-price-feeds

const AGGREGATOR_ABI = [
  { name: 'latestRoundData', type: 'function', stateMutability: 'view', inputs: [], outputs: [
    { name: 'roundId', type: 'uint80' }, { name: 'answer', type: 'int256' },
    { name: 'startedAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' }, { name: 'answeredInRound', type: 'uint80' }
  ]}
] as const

interface PriceCardProps { feed: typeof CHAINLINK_FEEDS[string]; symbol: string }

function PriceCard({ feed, symbol }: PriceCardProps) {
  const { data, refetch, isLoading } = useReadContract({
    address: feed.address,
    abi: AGGREGATOR_ABI,
    functionName: 'latestRoundData',
    query: { enabled: feed.address !== '0x0000000000000000000000000000000000000000' },
  })

  const price = data ? Number(BigInt((data)[1]) / BigInt(10 ** (feed.decimals - 2))) / 100 : null

  const icons: Record<string, string> = { BTC_USD: '₿', ETH_USD: 'Ξ', SOL_USD: '◎', USDC_USD: '$' }

  return (
    <div className="flex items-center justify-between rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
          {icons[symbol] ?? '?'}
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{feed.name}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{feed.pair}</p>
        </div>
      </div>
      <div className="text-right">
        {isLoading ? (
          <RefreshCw className="size-4 animate-spin ml-auto" style={{ color: 'var(--muted)' }} />
        ) : price !== null ? (
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Mainnet only</p>
        )}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Chainlink</p>
      </div>
    </div>
  )
}

interface Props { open: boolean; onClose: () => void }

export default function ChainlinkSheet({ open, onClose }: Props) {
  const { chainName, isTestnet } = useNetwork()

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
                  <TrendingUp className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Price Feeds</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Chainlink on Arc</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
              {isTestnet && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#FFF8E1', border: '1px solid #F59E0B' }}>
                  <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
                  <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                    Chainlink price feeds are on Arc Mainnet only. Switch to mainnet to see live prices.
                  </p>
                </div>
              )}
              <p className="text-xs" style={{ color: 'var(--muted)' }}>30 Chainlink oracle price feeds are available on Arc Mainnet. Contract addresses will be populated when the official Arc Chainlink integration is published.</p>
              {Object.entries(CHAINLINK_FEEDS).map(([sym, feed]) => (
                <PriceCard key={sym} symbol={sym} feed={feed} />
              ))}
              <a href="https://docs.arc.io/build/chainlink-price-feeds" target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1 text-xs font-semibold underline" style={{ color: 'var(--muted)' }}>
                Full list of Arc Chainlink feeds <ExternalLink className="size-3" />
              </a>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
