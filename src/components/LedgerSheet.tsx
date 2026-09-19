/**
 * LedgerSheet — onchain USDC transfer ledger for Arc Testnet & Mainnet.
 *
 * Fetches real Transfer events from the USDC ERC-20 contract on the active
 * network, groups them by date, and renders a bank-statement-style list.
 *
 * Works with both Arc Testnet (chain 5042002) and Arc Mainnet (chain 5042).
 */
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BookOpen, ArrowDownToLine, SendHorizonal,
  RefreshCw, ExternalLink, ChevronDown, AlertCircle,
  Loader2, Filter,
} from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseAbiItem, formatUnits } from 'viem'
import { getUsdc, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { useNetwork } from '@/NetworkContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LedgerEntry {
  hash: string
  direction: 'sent' | 'received'
  amount: string          // formatted USDC
  counterparty: string    // address
  blockNumber: bigint
  timestamp: number       // ms
  logIndex: number
}

type FilterMode = 'all' | 'sent' | 'received'
type DateGroup  = { label: string; entries: LedgerEntry[] }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatDateGroup(ts: number): string {
  const d   = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function groupByDate(entries: LedgerEntry[]): DateGroup[] {
  const map = new Map<string, LedgerEntry[]>()
  for (const e of entries) {
    const label = formatDateGroup(e.timestamp)
    const arr = map.get(label) ?? []
    arr.push(e)
    map.set(label, arr)
  }
  return Array.from(map.entries()).map(([label, ents]) => ({ label, entries: ents }))
}

function avatarPair(addr: string): [string, string] {
  const BKGS  = ['#dbeafe','#dcfce7','#fef9c3','#ffe4e6','#f3e8ff','#cffafe','#ffedd5']
  const TEXTS = ['#2563eb','#16a34a','#ca8a04','#dc2626','#9333ea','#0891b2','#ea580c']
  const i = parseInt(addr.slice(2, 4), 16) % BKGS.length
  return [BKGS[i], TEXTS[i]]
}

// ─── Hook: fetch onchain ledger ───────────────────────────────────────────────

const CHUNK_SIZE  = 500n       // max blocks per getLogs call (Arc RPC limit)
const N_CHUNKS    = 10         // scan up to 10 chunks (5 000 blocks) per page
const MAX_ENTRIES = 200

interface UseLedgerResult {
  entries:  LedgerEntry[]
  loading:  boolean
  error:    string | null
  hasMore:  boolean
  loadMore: () => void
  refresh:  () => void
}

function useLedger(address: `0x${string}` | undefined): UseLedgerResult {
  const { chainId }  = useNetwork()
  const client       = usePublicClient({ chainId })
  const usdcFact     = getUsdc(chainId)
  const usdcAddress  = usdcFact?.address as `0x${string}` | undefined
  const decimals     = usdcFact?.decimals ?? 6

  const [entries,  setEntries]  = useState<LedgerEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [fromBlock, setFromBlock] = useState<bigint | null>(null)   // oldest block fetched so far
  const [hasMore,  setHasMore]  = useState(true)
  const [runKey,   setRunKey]   = useState(0)

  const refresh = useCallback(() => {
    setEntries([])
    setFromBlock(null)
    setHasMore(true)
    setError(null)
    setRunKey(k => k + 1)
  }, [])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) setRunKey(k => k + 1)
  }, [loading, hasMore])

  useEffect(() => {
    if (!address || !client || !usdcAddress) return
    let cancelled = false

    const fetchPage = async () => {
      setLoading(true)
      setError(null)
      try {
        const latest = await client.getBlockNumber()

        // cursor: newest block not yet scanned
        const cursor = fromBlock != null ? fromBlock - 1n : latest
        if (cursor < 0n) { setHasMore(false); setLoading(false); return }

        // Scan N_CHUNKS × CHUNK_SIZE blocks, oldest chunk first in the window
        const windowEnd   = cursor
        const windowStart = windowEnd > BigInt(N_CHUNKS) * CHUNK_SIZE
          ? windowEnd - BigInt(N_CHUNKS) * CHUNK_SIZE + 1n
          : 0n

        // Split into CHUNK_SIZE slices and fetch sequentially to stay under RPC limit
        type TLog = { transactionHash?: `0x${string}`; blockNumber?: bigint; logIndex?: number; args?: { from?: `0x${string}`; to?: `0x${string}`; value?: bigint } }
        const allLogs: TLog[] = []
        let chunkTo = windowEnd
        while (chunkTo >= windowStart) {
          const chunkFrom = chunkTo >= CHUNK_SIZE ? chunkTo - CHUNK_SIZE + 1n : 0n
          const clampedFrom = chunkFrom < windowStart ? windowStart : chunkFrom
          const [sent, recv] = await Promise.all([
            client.getLogs({
              address: usdcAddress,
              event: TRANSFER_EVENT,
              args:  { from: address },
              fromBlock: clampedFrom,
              toBlock: chunkTo,
            }),
            client.getLogs({
              address: usdcAddress,
              event: TRANSFER_EVENT,
              args:  { to: address },
              fromBlock: clampedFrom,
              toBlock: chunkTo,
            }),
          ])
          allLogs.push(...sent, ...recv)
          if (chunkFrom <= windowStart) break
          chunkTo = chunkFrom - 1n
        }

        if (cancelled) return

        // track the oldest block we scanned this page
        const oldestScanned = windowStart

        // Fetch block timestamps for unique block numbers
        const blockNums = [...new Set(allLogs.map(l => l.blockNumber).filter((b): b is bigint => b != null))]
        const blockMap  = new Map<bigint, number>()

        await Promise.all(blockNums.map(async bn => {
          try {
            const blk = await client.getBlock({ blockNumber: bn })
            blockMap.set(bn, Number(blk.timestamp) * 1000)
          } catch {
            blockMap.set(bn, Date.now())
          }
        }))

        if (cancelled) return

        const newEntries: LedgerEntry[] = allLogs
          .filter(l => l.transactionHash && l.blockNumber != null)
          .map(l => {
            const args = l.args ?? {}
            const isSent = args.from?.toLowerCase() === address.toLowerCase()
            const counterparty = (isSent ? args.to : args.from) ?? '0x0000000000000000000000000000000000000000'
            return {
              hash:         l.transactionHash as string,
              direction:    isSent ? 'sent' : 'received',
              amount:       formatUnits(args.value ?? 0n, decimals),
              counterparty,
              blockNumber:  l.blockNumber!,
              timestamp:    blockMap.get(l.blockNumber!) ?? Date.now(),
              logIndex:     l.logIndex ?? 0,
            } satisfies LedgerEntry
          })
          .sort((a, b) => b.timestamp - a.timestamp || b.logIndex - a.logIndex)

        setEntries(prev => {
          const merged = [...prev]
          const seen   = new Set(prev.map(e => `${e.hash}-${e.logIndex}`))
          for (const e of newEntries) {
            const key = `${e.hash}-${e.logIndex}`
            if (!seen.has(key)) { merged.push(e); seen.add(key) }
          }
          merged.sort((a, b) => b.timestamp - a.timestamp || b.logIndex - a.logIndex)
          return merged.slice(0, MAX_ENTRIES)
        })
        setFromBlock(oldestScanned)
        setHasMore(oldestScanned > 0n && entries.length + newEntries.length < MAX_ENTRIES)
      } catch (err) {
        if (!cancelled) setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchPage()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, address, chainId, usdcAddress])

  // Reset when address or chain changes
  useEffect(() => {
    setEntries([])
    setFromBlock(null)
    setHasMore(true)
    setError(null)
    setRunKey(k => k + 1)
  }, [address, chainId])

  return { entries, loading, error, hasMore, loadMore, refresh }
}

// ─── Entry row ───────────────────────────────────────────────────────────────

function EntryRow({ entry, chainId }: { entry: LedgerEntry; chainId: number }) {
  const [bg, fg] = avatarPair(entry.counterparty)
  const isSent   = entry.direction === 'sent'

  return (
    <a
      href={buildTxExplorerUrl(chainId, entry.hash)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 py-3 hover:bg-slate-50 transition-colors rounded-xl px-2 -mx-2"
    >
      {/* Avatar */}
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: bg, color: fg }}
      >
        {entry.counterparty.slice(2, 4).toUpperCase()}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {isSent ? 'Sent USDC' : 'Received USDC'}
        </p>
        <p className="text-xs text-slate-400">
          {isSent ? 'To ' : 'From '}{shortAddr(entry.counterparty)}
        </p>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <p
          className="text-sm font-bold tabular-nums"
          style={{ color: isSent ? 'var(--danger)' : 'var(--success)' }}
        >
          {isSent ? '−' : '+'}${parseFloat(entry.amount).toFixed(2)}
        </p>
        <p className="text-[10px] text-slate-400">USDC</p>
      </div>

      {/* Link icon */}
      <ExternalLink className="size-3.5 shrink-0 text-slate-300" />
    </a>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ entries }: { entries: LedgerEntry[] }) {
  const totalIn  = entries.filter(e => e.direction === 'received').reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalOut = entries.filter(e => e.direction === 'sent').reduce((s, e) => s + parseFloat(e.amount), 0)

  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
      <div className="rounded-xl p-3 text-center" style={{ background: '#f0fdf4' }}>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <ArrowDownToLine className="size-3.5 text-green-600" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-green-700">Total In</span>
        </div>
        <p className="text-base font-extrabold tabular-nums text-green-700">
          ${totalIn.toFixed(2)}
        </p>
        <p className="text-[9px] text-green-600">{entries.filter(e => e.direction === 'received').length} txs</p>
      </div>
      <div className="rounded-xl p-3 text-center" style={{ background: '#fff1f2' }}>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <SendHorizonal className="size-3.5 text-red-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-600">Total Out</span>
        </div>
        <p className="text-base font-extrabold tabular-nums text-red-600">
          ${totalOut.toFixed(2)}
        </p>
        <p className="text-[9px] text-red-500">{entries.filter(e => e.direction === 'sent').length} txs</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  onClose: () => void
}

export default function LedgerSheet({ open, onClose }: Props) {
  const { chainId, chainName, isTestnet } = useNetwork()
  const { address }  = useAccount()
  const usdcFact     = getUsdc(chainId)

  const { entries, loading, error, hasMore, loadMore, refresh } = useLedger(
    address
  )

  const [filter, setFilter]     = useState<FilterMode>('all')
  const [showInfo, setShowInfo] = useState(false)

  const filtered = filter === 'all' ? entries : entries.filter(e => e.direction === filter)
  const groups   = groupByDate(filtered)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl"
                  style={{ background: '#eff6ff' }}>
                  <BookOpen className="size-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold" style={{ color: 'var(--ink)' }}>Ledger</h2>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full inline-block"
                      style={{ background: isTestnet ? '#2563eb' : '#16a34a' }}
                    />
                    <span className="text-[10px] font-semibold"
                      style={{ color: isTestnet ? '#2563eb' : '#16a34a' }}>
                      {chainName} · USDC
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refresh}
                  disabled={loading}
                  className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  <RefreshCw className={`size-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                >
                  <X className="size-5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">

              {/* Address explorer link */}
              {address && (
                <a
                  href={buildAddressExplorerUrl(chainId, address)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 hover:bg-slate-100 transition-colors"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <span className="text-xs font-bold">{address.slice(2, 4).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{address}</p>
                    <p className="text-[10px] text-slate-400">View on {isTestnet ? 'Arc Testnet Explorer' : 'Arc Explorer'}</p>
                  </div>
                  <ExternalLink className="size-4 shrink-0 text-slate-400" />
                </a>
              )}

              {/* USDC contract info */}
              {usdcFact && (
                <button
                  onClick={() => setShowInfo(v => !v)}
                  className="w-full flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 hover:bg-blue-100 transition-colors"
                  style={{ border: '1px solid #bfdbfe' }}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <span className="text-xs font-extrabold text-blue-600">$</span>
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-semibold text-blue-700">USDC Contract</p>
                    <p className="text-[10px] text-blue-500 truncate">{usdcFact.address}</p>
                  </div>
                  <ChevronDown className={`size-4 text-blue-400 transition-transform ${showInfo ? 'rotate-180' : ''}`} />
                </button>
              )}
              {showInfo && usdcFact && (
                <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Symbol</span>
                    <span className="text-xs font-bold text-slate-700">{usdcFact.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Decimals</span>
                    <span className="text-xs font-bold text-slate-700">{usdcFact.decimals}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Network</span>
                    <span className="text-xs font-bold" style={{ color: isTestnet ? '#2563eb' : '#16a34a' }}>{chainName}</span>
                  </div>
                  <a
                    href={buildAddressExplorerUrl(chainId, usdcFact.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    View USDC contract <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Summary */}
              {entries.length > 0 && <SummaryBar entries={entries} />}

              {/* Filter pills */}
              <div className="flex gap-2">
                <div className="flex items-center gap-1 mr-1">
                  <Filter className="size-3.5 text-slate-400" />
                  <span className="text-xs text-slate-400">Filter</span>
                </div>
                {(['all', 'sent', 'received'] as FilterMode[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                    style={filter === f
                      ? { background: '#1d2f50', color: 'white' }
                      : { background: 'white', color: 'var(--muted)', border: '1px solid var(--border)' }
                    }
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4" style={{ border: '1px solid #fecaca' }}>
                  <AlertCircle className="size-4 mt-0.5 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Failed to load transactions</p>
                    <p className="text-xs text-red-500 mt-0.5">{error}</p>
                    <button onClick={refresh} className="mt-2 text-xs font-semibold text-red-600 hover:underline">Try again</button>
                  </div>
                </div>
              )}

              {/* Loading skeleton */}
              {loading && entries.length === 0 && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="size-10 rounded-full bg-slate-100 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded-full bg-slate-100 animate-pulse w-1/2" />
                        <div className="h-2.5 rounded-full bg-slate-100 animate-pulse w-1/3" />
                      </div>
                      <div className="space-y-1.5 text-right">
                        <div className="h-3 rounded-full bg-slate-100 animate-pulse w-16" />
                        <div className="h-2.5 rounded-full bg-slate-100 animate-pulse w-10" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Not connected */}
              {!address && !loading && (
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: '1px solid var(--border)' }}>
                  <BookOpen className="mx-auto size-10 text-slate-200" />
                  <p className="mt-3 text-sm font-semibold text-slate-500">Connect your wallet</p>
                  <p className="mt-1 text-xs text-slate-400">Your onchain USDC history will appear here</p>
                </div>
              )}

              {/* Transaction groups */}
              {groups.length > 0 && (
                <div className="space-y-4">
                  {groups.map(group => (
                    <div key={group.label}>
                      {/* Date separator */}
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                          {group.label}
                        </span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>

                      {/* Entry rows */}
                      <div className="rounded-2xl bg-white px-3 shadow-sm divide-y"
                        style={{ border: '1px solid var(--border)', borderColor: 'rgba(0,0,0,0.05)' }}>
                        {group.entries.map(entry => (
                          <EntryRow key={`${entry.hash}-${entry.logIndex}`} entry={entry} chainId={chainId} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!loading && address && groups.length === 0 && !error && (
                <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: '1px solid var(--border)' }}>
                  <BookOpen className="mx-auto size-10 text-slate-200" />
                  <p className="mt-3 text-sm font-semibold text-slate-500">No USDC transfers found</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Showing last {(Number(CHUNK_SIZE) * N_CHUNKS).toLocaleString()} blocks on {chainName}
                  </p>
                </div>
              )}

              {/* Load more */}
              {hasMore && entries.length > 0 && !loading && (
                <button
                  onClick={loadMore}
                  className="w-full rounded-2xl py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
                  style={{ border: '1px solid #bfdbfe' }}
                >
                  Load older transactions
                </button>
              )}

              {/* Loading more spinner */}
              {loading && entries.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm">Loading transactions…</span>
                </div>
              )}

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
