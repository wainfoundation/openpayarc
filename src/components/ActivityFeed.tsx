import { useAccount } from 'wagmi'
import { ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useNetwork } from '@/NetworkContext'

export interface TxRecord {
  hash: string
  direction: 'sent' | 'received'
  amount: string
  counterparty: string
  timestamp: number
  memo?: string
  name?: string        // display name / label for the counterparty
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function initials(addr: string, name?: string): string {
  if (name) return name.slice(0, 2).toUpperCase()
  return addr.slice(2, 4).toUpperCase()
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const AVATAR_COLORS = [
  '#dbeafe', '#dcfce7', '#fef9c3', '#ffe4e6', '#f3e8ff',
  '#cffafe', '#ffedd5', '#e0f2fe',
]
const AVATAR_TEXT = [
  '#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea',
  '#0891b2', '#ea580c', '#0284c7',
]
function avatarColor(addr: string): [string, string] {
  const idx = parseInt(addr.slice(2, 4), 16) % AVATAR_COLORS.length
  return [AVATAR_COLORS[idx], AVATAR_TEXT[idx]]
}

interface Props {
  txHistory: TxRecord[]
  chainId?: number
  compact?: boolean   // compact=true: no section wrapper, no header (for embedding in HomeScreen)
  limit?: number
}

export default function ActivityFeed({ txHistory, chainId: chainIdProp, compact = false, limit }: Props) {
  const { isConnected } = useAccount()
  const { chainId: networkChainId } = useNetwork()
  const chainId = chainIdProp ?? networkChainId

  const items = limit ? txHistory.slice(0, limit) : txHistory

  const empty = (
    <p className={`${compact ? 'py-3' : 'py-6'} text-center text-sm text-slate-400`}>
      {!isConnected ? 'Connect your wallet to see activity' : 'No transactions yet'}
    </p>
  )

  const list = items.length === 0 ? empty : (
    <ul className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
      {items.map((tx) => {
        const [bg, fg] = avatarColor(tx.counterparty)
        return (
          <li key={tx.hash} className="flex items-center gap-3 py-3">
            {/* Avatar */}
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: bg, color: fg }}
            >
              {initials(tx.counterparty, tx.name)}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {tx.name ?? (tx.direction === 'sent' ? 'Sent USDC' : 'Received USDC')}
              </p>
              <p className="text-xs text-slate-400">
                {tx.memo ? `${tx.memo} · ` : ''}
                {tx.direction === 'sent' ? 'To ' : 'From '}
                {formatAddress(tx.counterparty)}
                {' · '}
                <a
                  href={buildTxExplorerUrl(chainId, tx.hash)}
                  target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="hover:underline"
                  style={{ color: '#2563eb' }}
                >
                  {formatTime(tx.timestamp)}
                </a>
              </p>
            </div>

            {/* Amount + link */}
            <div className="shrink-0 text-right">
              <p
                className="display text-sm font-bold tabular-nums"
                style={{ color: tx.direction === 'sent' ? 'var(--danger)' : 'var(--success)' }}
              >
                {tx.direction === 'sent' ? '-' : '+'}${tx.amount}
              </p>
              <p className="text-xs text-slate-400">USDC</p>
            </div>

            {!compact && (
              <a
                href={buildTxExplorerUrl(chainId, tx.hash)}
                target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="shrink-0 opacity-30 transition-opacity hover:opacity-100"
              >
                <ExternalLink className="size-3.5 text-slate-400" />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )

  if (compact) return list

  return (
    <section className="rounded-3xl bg-white px-4 py-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Activity</h3>
      {list}
    </section>
  )
}
