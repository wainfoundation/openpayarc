import { useCallback, useEffect, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useDisconnect } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import {
  Grid2x2, Bell, EyeOff, Eye, ArrowDownToLine, SendHorizonal,
  ArrowLeftRight, QrCode, LayoutGrid, AlertTriangle, X,
  ShieldCheck, ChevronDown, Loader2, PiggyBank, MoreHorizontal,
  Copy, Check, ExternalLink, ArrowUpDown, Link2, BookOpen, Sun, Moon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { TokenUSDC } from '@web3icons/react'
import { useModal } from 'connectkit'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { getArcToken } from '@/arcTokens'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'

import { useNetwork } from '@/NetworkContext'
import SendSheet from '@/components/SendSheet'
import ReceiveSheet from '@/components/ReceiveSheet'
import ActivityFeed, { type TxRecord } from '@/components/ActivityFeed'
import AdminPanel from '@/components/AdminPanel'
import BottomNav, { type NavTab } from '@/components/BottomNav'
import ScannerPage from '@/components/ScannerPage'
import TransferSheet from '@/components/TransferSheet'
import AddFundsModal from '@/components/AddFundsModal'
import BridgeSheet from '@/components/BridgeSheet'
import SavingsSheet from '@/components/SavingsSheet'
import LedgerSheet from '@/components/LedgerSheet'
import SwapSheet from '@/components/SwapSheet'
import TxReceiptModal from '@/components/TxReceiptModal'
import { TermsModal, PrivacyModal, useTermsAccepted } from '@/components/LegalModal'
import OpenPayConnect, { useOpenPayAccount } from '@/components/OpenPayConnect'
import QRPaySheet from '@/components/QRPaySheet'
import { OUSDSwapSheet } from '@/components/OUSDSwapSheet'
import OUSDInfoSheet from '@/components/OUSDInfoSheet'
import OUSDIcon from '@/components/OUSDIcon'
import { useTheme } from '@/hooks/useTheme'
import EURCSheet from '@/components/EURCSheet'
import StableFXSheet from '@/components/StableFXSheet'
import ChainlinkSheet from '@/components/ChainlinkSheet'
import BatchSendSheet from '@/components/BatchSendSheet'
import AgentSheet from '@/components/AgentSheet'
import UnifiedBalanceSheet from '@/components/UnifiedBalanceSheet'
import USYCSheet from '@/components/USYCSheet'

const OUSD_BLUE = '#0D47D1'
const OUSD_LIGHT = '#E8EFFE'
const OUSD_BORDER = '#C5D5F8'

// ─── OUSD constants ───────────────────────────────────────────────────────────
const OUSD_DECIMALS = 6
const OUSD_ADDRESSES_MAP: Record<number, { token: `0x${string}` }> = {
  5042002: { token: '0xdd9cb6cbe39f5caf475241124e749875d7e7b355' },
  5042:    { token: '0x0000000000000000000000000000000000000000' }, // TODO: replace after mainnet deploy
}
function getOusdToken(chainId: number): `0x${string}` {
  return OUSD_ADDRESSES_MAP[chainId]?.token ?? '0x0000000000000000000000000000000000000000'
}
function isOusdDeployed(chainId: number): boolean {
  const addr = getOusdToken(chainId)
  return addr !== '0x0000000000000000000000000000000000000000'
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (error as { code?: number })?.code === 4001) return 'Cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance.'
  if (msg.includes('reverted')) return 'Transaction failed. Please try again.'
  return 'Something went wrong. Please try again.'
}

// ─── Prefill payment ─────────────────────────────────────────────────────────

interface PrefillData { to: string; amount: string; memo: string }

function usePrefill(): PrefillData | null {
  const params = new URLSearchParams(window.location.search)
  const to = params.get('to') ?? ''
  const amount = params.get('amount') ?? ''
  const memo = params.get('memo') ?? ''
  if (!to || !isAddress(to)) return null
  return { to, amount, memo }
}

function PrefillBanner({ data, onDismiss }: { data: PrefillData; onDismiss: () => void }) {
  const { chainId: targetChainId, chainName } = useNetwork()
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(targetChainId)
  const USDC_ADDRESS = (usdcFact?.address ?? '0x0') as `0x${string}`
  const isWrongChain = chainId !== targetChainId
  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const txUrl = hash ? buildTxExplorerUrl(targetChainId, hash) : null
  const ready = Boolean(address) && !isPending && !isConfirming && !isSuccess && Boolean(data.amount)

  const handlePay = () => {
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    let parsed: Amount
    try { parsed = parseAmount(targetChainId, data.amount) } catch { return }
    writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [data.to as `0x${string}`, parsed.raw], chainId: targetChainId })
  }

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: '1px solid rgba(37,99,235,0.15)' }}>
      <div className="h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Payment request</p>
            {data.memo && <p className="mt-0.5 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>{data.memo}</p>}
          </div>
          <button onClick={() => { reset(); onDismiss() }} className="flex size-7 items-center justify-center rounded-full bg-slate-100">
            <X className="size-3.5 text-slate-400" />
          </button>
        </div>
        {isSuccess ? (
          <div className="mt-3 rounded-xl bg-green-50 p-3 text-center">
            <p className="text-sm font-semibold text-green-700">Payment sent!</p>
            {txUrl && <a href={txUrl} target="_blank" rel="noreferrer" className="mt-1 text-xs text-blue-600 underline">View on explorer</a>}
          </div>
        ) : (
          <>
            <p className="mt-2 text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              ${data.amount || '—'} <span className="text-base font-medium text-slate-400">USDC</span>
            </p>
            <p className="mono text-xs text-slate-400">To {data.to.slice(0, 10)}...{data.to.slice(-6)} · {chainName}</p>
            {isError && <p className="mt-1 text-xs text-red-500">{parseOnchainError(error)}</p>}
            <button disabled={!ready} onClick={handlePay}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {!address ? 'Connect wallet to pay'
                : isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm...</span>
                : isConfirming ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirming...</span>
                : isWrongChain ? `Switch to ${chainName}`
                : 'Pay now'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Inbox tab ───────────────────────────────────────────────────────────────

interface Notification {
  id: string
  title: string
  body: string
  ts: number
  read: boolean
  type: 'received' | 'sent' | 'info'
}

function InboxTab({ txHistory, onTxClick }: { txHistory: TxRecord[]; onTxClick: (tx: TxRecord) => void }) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const notifications: Notification[] = txHistory.map(tx => ({
    id: tx.hash,
    title: tx.direction === 'received' ? `Received $${tx.amount} USDC` : `Sent $${tx.amount} USDC`,
    body: tx.memo
      ? tx.memo
      : tx.direction === 'received'
      ? `From ${formatAddress(tx.counterparty)}`
      : `To ${formatAddress(tx.counterparty)}`,
    ts: tx.timestamp,
    read: readIds.has(tx.hash),
    type: tx.direction,
  }))

  const markRead = (id: string) => setReadIds(prev => new Set([...prev, id]))
  const markAllRead = () => setReadIds(new Set(txHistory.map(t => t.hash)))
  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Inbox</h2>
          {unread > 0 && <p className="text-xs text-slate-400">{unread} unread</p>}
        </div>
        {notifications.length > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-semibold text-blue-600"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: '1px solid var(--border)' }}>
          <Bell className="mx-auto size-10 text-slate-200" />
          <p className="mt-3 text-sm text-slate-400">No notifications yet</p>
          <p className="mt-1 text-xs text-slate-300">Activity from your wallet will appear here</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => {
            const tx = txHistory.find(t => t.hash === n.id)
            return (
            <li
              key={n.id}
              onClick={() => { markRead(n.id); if (tx) onTxClick(tx) }}
              className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
              style={{ border: `1px solid ${n.read ? 'var(--border)' : 'rgba(37,99,235,0.2)'}` }}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: n.type === 'received' ? '#dcfce7' : n.type === 'sent' ? '#fee2e2' : '#eff6ff',
                }}
              >
                {n.type === 'received'
                  ? <ArrowDownToLine className="size-4 text-green-600" />
                  : n.type === 'sent'
                  ? <SendHorizonal className="size-4 text-red-500" />
                  : <Bell className="size-4 text-blue-600" />
                }
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{n.title}</p>
                  {!n.read && <span className="mt-1 size-2 shrink-0 rounded-full bg-blue-500" />}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{n.body}</p>
                <p className="mt-1 text-xs text-slate-300">
                  {new Date(n.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Savings tab ─────────────────────────────────────────────────────────────

// ─── Transactions tab ─────────────────────────────────────────────────────────

type TxFilter = 'all' | 'sent' | 'received'

function TransactionsTab({ txHistory, chainId, onLedger, onTxClick }: { txHistory: TxRecord[]; chainId: number; onLedger: () => void; onTxClick: (tx: TxRecord) => void }) {
  const [filter, setFilter] = useState<TxFilter>('all')

  const filtered = filter === 'all' ? txHistory : txHistory.filter(t => t.direction === filter)

  return (
    <div className="px-4 pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Transactions</h2>
        <button
          onClick={onLedger}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100"
          style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <span>Ledger</span>
        </button>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex gap-2">
        {(['all', 'sent', 'received'] as TxFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all"
            style={filter === f
              ? { background: '#1d2f50', color: 'white' }
              : { background: 'white', color: 'var(--muted)', border: '1px solid var(--border)' }
            }
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: '1px solid var(--border)' }}>
          <ExternalLink className="mx-auto size-8 text-slate-200" />
          <p className="mt-3 text-sm text-slate-400">No {filter === 'all' ? '' : filter} transactions yet</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white px-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
          <ActivityFeed txHistory={filtered} chainId={chainId} compact onTxClick={onTxClick} />
        </div>
      )}
    </div>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

// ─── Support sheet ────────────────────────────────────────────────────────────

function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const faqs = [
    { q: 'How do I send USDC?', a: 'Tap "Send funds" on the home screen, enter a wallet address or scan a QR code, enter the amount and confirm.' },
    { q: 'What is the platform fee?', a: 'OpenPay Arc charges 1% per transaction (minimum $0.01, maximum $5.00 USDC). Fees are displayed before you confirm any transaction.' },
    { q: 'How do I create a payment link?', a: 'Go to Pay Links from the home screen, tap "Create Payment Request", fill in the amount and memo, and share the generated link or QR code.' },
    { q: 'What chains are supported?', a: 'OpenPay Arc runs on Arc (mainnet and testnet). Arc uses USDC as its native gas token for fast, low-cost transactions.' },
    { q: 'How do I get test USDC?', a: 'On testnet, click "Get test USDC" in the Arc Studio sidebar, or tap the faucet link shown on the home screen balance card.' },
    { q: 'How does Savings work?', a: 'Savings deposits earn yield via the OpenPaySavings vault on Arc. You can deposit, withdraw, and claim rewards at any time.' },
    { q: 'Is this app open source?', a: 'OpenPay Arc is built on Arc Studio using Circle\'s USDC infrastructure. Source is available on GitHub.' },
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'white', maxHeight: '90dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-10 pt-2">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)', fontFamily: 'Space Grotesk, sans-serif' }}>Support</h2>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: '#f1f5f9' }}>
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {/* Contact CTA */}
              <div className="mb-5 overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(135deg,#1d2f50,#2d4a7a)' }}>
                <div className="p-5">
                  <p className="text-sm font-bold text-white">Need help?</p>
                  <p className="mt-0.5 text-xs text-blue-200">Our support team is here for you.</p>
                  <div className="mt-4 flex gap-2">
                    <a
                      href="mailto:support@openpay.arc"
                      className="flex-1 rounded-xl py-2.5 text-center text-xs font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      Email support
                    </a>
                    <a
                      href="https://docs.arc.io"
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 rounded-xl py-2.5 text-center text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: 'white', color: '#1d2f50' }}
                    >
                      Arc docs
                    </a>
                  </div>
                </div>
              </div>

              {/* FAQ */}
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Frequently asked questions</p>
              <div className="space-y-2">
                {faqs.map((faq, i) => (
                  <FaqItem key={i} q={faq.q} a={faq.a} />
                ))}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-semibold transition-colors hover:bg-slate-50"
        style={{ color: 'var(--ink)' }}
      >
        {q}
        <ChevronDown className={`size-4 shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-xs leading-relaxed text-slate-500">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Profile tab ─────────────────────────────────────────────────────────────

function ProfileTab({
  onAdmin, onTerms, onPrivacy, onOpenPay, openPayConnected, onSupport, onOusdInfo, onOusd,
}: {
  onAdmin: () => void
  onTerms: () => void
  onPrivacy: () => void
  onOpenPay: () => void
  openPayConnected: boolean
  onSupport: () => void
  onOusdInfo: () => void
  onOusd: () => void
}) {
  const { mode, chainName, isTestnet, features, chainId: profileChainId } = useNetwork()
  const { address, isConnected } = useAccount()
  const ousdReadyOnCurrentNetwork = isOusdDeployed(profileChainId)
  const [copiedAddr, setCopiedAddr] = useState(false)
  const { isDark, toggle: toggleTheme } = useTheme()

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddr(true)
      setTimeout(() => setCopiedAddr(false), 2000)
    }).catch(() => undefined)
  }

  // Legal row — always show terms/privacy; support is feature-gated
  const legalItems = [
    { label: 'Terms of Service', onClick: onTerms },
    { label: 'Privacy Policy', onClick: onPrivacy },
    ...(features.support ? [{ label: 'Support', onClick: onSupport }] : []),
  ]

  return (
    <div className="px-4 pb-28 pt-4">
      <h2 className="mb-4 text-xl font-bold" style={{ color: 'var(--ink)' }}>Profile</h2>

      <div className="space-y-3">
        {/* Avatar + name card */}
        <div className="rounded-2xl p-5 text-center shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="mx-auto flex size-16 items-center justify-center rounded-full text-xl font-bold"
            style={{ background: '#dbeafe', color: '#2563eb' }}>
            {address ? address.slice(2, 4).toUpperCase() : 'U'}
          </div>
          <p className="mt-3 text-base font-bold" style={{ color: 'var(--ink)' }}>
            {address ? formatAddress(address) : 'Not connected'}
          </p>
          {address && (
            <p className="mono mt-0.5 text-xs text-slate-400">
              Account no.: {address.slice(0, 16)}...
            </p>
          )}
          {address && (
            <button
              onClick={copyAddress}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all hover:bg-blue-100"
              style={{ background: '#eff6ff', color: '#2563eb' }}
            >
              {copiedAddr ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copiedAddr ? 'Copied!' : 'Copy address'}
            </button>
          )}
        </div>

        {/* Wallet connect */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Wallet</p>
          <div className="flex items-center justify-between">
            <div>
              {isConnected
                ? <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Connected</p>
                : <p className="text-sm text-slate-400">No wallet connected</p>
              }
              {address && <p className="mono text-xs text-slate-400">{formatAddress(address)}</p>}
            </div>
            <WalletHeaderButton />
          </div>
        </div>

        {/* Network card */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Network</p>
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full" style={{ background: isTestnet ? '#2563eb' : '#16a34a' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{chainName}</p>
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: isTestnet ? '#eff6ff' : '#dcfce7', color: isTestnet ? '#2563eb' : '#16a34a' }}>
              {mode}
            </span>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Appearance</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isDark
                ? <Moon className="size-5" style={{ color: 'var(--accent-blue)' }} />
                : <Sun className="size-5 text-amber-500" />}
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {isDark ? 'Dark mode' : 'Light mode'}
              </span>
            </div>
            {/* Pill toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300"
              style={{ background: isDark ? '#0D47D1' : '#e2e8f0' }}
            >
              <span
                className="absolute flex size-5 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300"
                style={{ transform: isDark ? 'translateX(22px)' : 'translateX(4px)' }}
              >
                {isDark
                  ? <Moon className="size-3 text-blue-700" />
                  : <Sun className="size-3 text-amber-500" />}
              </span>
            </button>
          </div>
        </div>

        {/* Admin entry */}
        <button
          onClick={onAdmin}
          className="flex w-full items-center gap-3 rounded-2xl p-4 shadow-sm transition-colors hover:opacity-80"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100">
            <ShieldCheck className="size-5" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="flex-1 text-left text-sm font-semibold" style={{ color: 'var(--ink)' }}>Admin panel</span>
          <ChevronDown className="size-4 -rotate-90 text-slate-300" />
        </button>

        {/* USDC info */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <TokenUSDC variant="branded" size={32} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>OpenPay Arc</p>
              <p className="text-xs text-slate-400">Powered by Circle · USDC stablecoin</p>
            </div>
          </div>
        </div>

        {/* OUSD card — gated by ousd feature flag */}
        {features.ousd && <div className="overflow-hidden rounded-2xl shadow-sm" style={{ border: `1px solid ${OUSD_BORDER}`, background: OUSD_LIGHT }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <OUSDIcon size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: OUSD_BLUE }}>OpenPay OpenUSD</p>
              <p className="text-xs" style={{ color: '#4C7BEE' }}>
                OUSD · 1:1 USD · {isTestnet ? 'Arc Testnet' : 'Arc Mainnet'} · ERC-20
                {!ousdReadyOnCurrentNetwork && ' · Coming soon'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={onOusdInfo}
                className="rounded-xl px-3 py-1.5 text-xs font-bold transition-colors hover:opacity-80"
                style={{ background: 'white', color: OUSD_BLUE, border: `1px solid ${OUSD_BORDER}` }}
              >
                Whitepaper
              </button>
              {ousdReadyOnCurrentNetwork && (
                <button
                  onClick={onOusd}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold text-white transition-colors hover:opacity-80"
                  style={{ background: OUSD_BLUE }}
                >
                  Swap
                </button>
              )}
            </div>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-3 border-t" style={{ borderColor: OUSD_BORDER }}>
            {[
              { label: 'Peg', value: '$1.00' },
              { label: 'Backed', value: '100%' },
              { label: 'Swap fee', value: '1%' },
            ].map((s, i, arr) => (
              <div key={s.label}
                className="flex flex-col items-center py-2.5"
                style={i < arr.length - 1 ? { borderRight: `1px solid ${OUSD_BORDER}` } : undefined}>
                <span className="text-sm font-bold" style={{ color: OUSD_BLUE }}>{s.value}</span>
                <span className="text-[10px]" style={{ color: '#4C7BEE' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>}

        {/* Connected Accounts — feature-gated */}
        {features.connectedAccounts && (
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Connected Accounts</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-blue-100">
                  <span className="text-xs font-bold text-blue-600">OP</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">OpenPay</p>
                  <p className="text-xs text-slate-400">{openPayConnected ? 'Connected' : 'Not connected'}</p>
                </div>
              </div>
              <button onClick={onOpenPay}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
                style={openPayConnected
                  ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                  : { background: 'var(--accent)', color: 'white' }}>
                {openPayConnected ? 'Connected ✓' : 'Connect'}
              </button>
            </div>
          </div>
        )}

        {/* Resources */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Resources</p>
          </div>
          {/* Arc Whitepaper */}
          <a
            href="https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/PDFs/arc_whitepaper.pdf"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex size-9 items-center justify-center rounded-xl shrink-0" style={{ background: '#0B1736' }}>
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="16" fill="#0B1736"/>
                <path d="M8 24V8h10l6 6v10H8z" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M18 8v6h6" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                <line x1="11" y1="15" x2="21" y2="15" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="11" y1="18" x2="21" y2="18" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1="11" y1="21" x2="17" y2="21" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Arc Whitepaper</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>The Arc blockchain · PDF · Circle</p>
            </div>
            <ExternalLink className="size-4 shrink-0 text-slate-300" />
          </a>
          {/* OUSD Whitepaper */}
          <button
            onClick={onOusdInfo}
            className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex size-9 items-center justify-center rounded-xl shrink-0" style={{ background: OUSD_BLUE }}>
              <OUSDIcon size={20} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>OUSD Whitepaper</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>OpenPay OpenUSD · ERC-20 · Arc</p>
            </div>
            <ChevronDown className="size-4 shrink-0 -rotate-90 text-slate-300" />
          </button>
          {/* Arc Docs */}
          <a
            href="https://docs.arc.io"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50"
          >
            <div className="flex size-9 items-center justify-center rounded-xl shrink-0" style={{ background: '#eff6ff' }}>
              <BookOpen className="size-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Arc Developer Docs</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>docs.arc.io</p>
            </div>
            <ExternalLink className="size-4 shrink-0 text-slate-300" />
          </a>
        </div>

        {/* Legal / Support */}
        {legalItems.length > 0 && (
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {legalItems.map((item, i, arr) => (
              <button key={item.label} onClick={item.onClick}
                className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                style={i < arr.length - 1 ? { borderBottom: '1px solid var(--border)' } : undefined}>
                {item.label}
                <ChevronDown className="size-4 -rotate-90 text-slate-300" />
              </button>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-slate-300">OpenPay Arc v1.0 · © 2026</p>
      </div>
    </div>
  )
}

// ─── Home screen ─────────────────────────────────────────────────────────────

type ServiceTab = 'wallet' | 'savings' | 'qrpay' | 'more'

function ServiceTabs({ active, onTab }: { active: ServiceTab; onTab: (t: ServiceTab) => void }) {
  const { features } = useNetwork()
  const allTabs: { id: ServiceTab; icon: React.ReactNode; label: string; featureKey?: string }[] = [
    { id: 'wallet',  icon: <LayoutGrid className="size-5" />,    label: 'Wallet' },
    { id: 'savings', icon: <PiggyBank className="size-5" />,     label: 'Savings',   featureKey: 'savings' },
    { id: 'qrpay',  icon: <QrCode className="size-5" />,         label: 'Pay Links', featureKey: 'payLinks' },
    { id: 'more',   icon: <MoreHorizontal className="size-5" />, label: 'More' },
  ]
  const tabs = allTabs.filter(t => !t.featureKey || features[t.featureKey as keyof typeof features])
  return (
    <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map(t => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 transition-all"
            style={{ background: isActive ? '#dbeafe' : 'transparent', color: isActive ? '#2563eb' : 'var(--subtle)' }}
          >
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ background: isActive ? '#2563eb' : 'rgba(100,116,139,0.08)' }}
            >
              <span style={{ color: isActive ? 'white' : 'var(--muted)' }}>{t.icon}</span>
            </div>
            <span className="text-xs font-semibold">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 transition-transform hover:scale-105 active:scale-95"
    >
      <div className="flex size-12 items-center justify-center rounded-2xl" style={{ background: '#eff6ff', color: '#2563eb' }}>
        {icon}
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
    </button>
  )
}

function HomeScreen({
  txHistory,
  onSend,
  onAddFunds,
  onReceive,
  onQR,
  onTransfer,
  onSeeAll,
  onSavings,
  onLedger,
  onSwap,
  onQRPay,
  onSupport,
  onOusd,
  onOusdInfo,
  onEurc,
  onStableFX,
  onChainlink,
  onBatchSend,
  onAgent,
  onUnified,
  onUsyc,
  onTxClick,
}: {
  txHistory: TxRecord[]
  onSend: () => void
  onAddFunds: () => void
  onReceive: () => void
  onQR: () => void
  onTransfer: () => void
  onSeeAll: () => void
  onSavings: () => void
  onLedger: () => void
  onSwap: () => void
  onQRPay: () => void
  onSupport: () => void
  onOusd: () => void
  onOusdInfo: () => void
  onEurc: () => void
  onStableFX: () => void
  onChainlink: () => void
  onBatchSend: () => void
  onAgent: () => void
  onUnified: () => void
  onUsyc: () => void
  onTxClick: (tx: TxRecord) => void
}) {
  const { chainId: targetChainId, isTestnet, features } = useNetwork()
  const { address, isConnected } = useAccount()
  const [balanceHidden, setBalanceHidden] = useState(false)
  const [serviceTab, setServiceTab] = useState<ServiceTab>('wallet')
  const [prefillDismissed, setPrefillDismissed] = useState(false)
  const prefill = usePrefill()

  const usdcFact = getUsdc(targetChainId)
  const USDC_ADDRESS = (usdcFact?.address ?? '0x0') as `0x${string}`

  const { data: rawBalance, isLoading: balanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(address) && Boolean(usdcFact), refetchInterval: 8_000 },
  })

  const formattedBalance = rawBalance != null
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(targetChainId)).toFixed(2)
    : null

  // OUSD balance — shown on both networks, disabled when not yet deployed
  const ousdTokenAddr = getOusdToken(targetChainId)
  const ousdDeployed  = isOusdDeployed(targetChainId)

  // EURC balance
  const eurcToken = getArcToken(targetChainId, 'EURC')
  const { data: rawEurcBal } = useReadContract({
    address: eurcToken?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && eurcToken?.address), refetchInterval: 12_000 },
  })
  const fmtEurc = rawEurcBal != null ? (Number(rawEurcBal) / 1e6).toFixed(2) : '0.00'

  // USYC balance
  const usycToken = getArcToken(targetChainId, 'USYC')
  const { data: rawUsycBal } = useReadContract({
    address: usycToken?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usycToken?.address), refetchInterval: 12_000 },
  })
  const fmtUsyc = rawUsycBal != null ? (Number(rawUsycBal) / 1e6).toFixed(2) : '0.00'

  // cirBTC balance
  const cirbtcToken = getArcToken(targetChainId, 'cirBTC')
  const { data: rawCirbtcBal } = useReadContract({
    address: cirbtcToken?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && cirbtcToken?.address), refetchInterval: 12_000 },
  })
  const fmtCirbtc = rawCirbtcBal != null ? (Number(rawCirbtcBal) / 1e8).toFixed(6) : '0.000000'
  const { data: rawOusdBalance, isLoading: ousdBalanceLoading } = useReadContract({
    address: ousdTokenAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && ousdDeployed, refetchInterval: 10_000 },
  })
  const formattedOusdBalance = rawOusdBalance != null
    ? (Number(rawOusdBalance) / 10 ** OUSD_DECIMALS).toFixed(2)
    : null

  const recentTx = txHistory.slice(0, 3)

  // When savings / QR tabs clicked in service row, open relevant sheet
  const handleServiceTab = (t: ServiceTab) => {
    if (t === 'qrpay') { onQRPay(); return }
    if (t === 'savings') { onSavings(); return }
    setServiceTab(t)
  }

  return (
    <div className="pb-28 pt-0">
      <AnimatePresence>
        {prefill && !prefillDismissed && (
          <motion.div key="prefill" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <PrefillBanner data={prefill} onDismiss={() => setPrefillDismissed(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balance card */}
      <div className="mx-4 overflow-hidden rounded-3xl bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">Personal</span>
          <button className="flex size-8 items-center justify-center rounded-full bg-slate-50 text-slate-400">
            <Grid2x2 className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-5 pt-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: 'var(--accent-blue)' }}>Total Balance</span>
            <button onClick={() => setBalanceHidden(h => !h)} className="text-slate-300 transition-colors hover:text-slate-400">
              {balanceHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          </div>

          <div className="mb-0.5">
            {balanceLoading ? (
              <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
            ) : (
              <span className="display text-[2.75rem] font-bold tabular-nums leading-none" style={{ color: 'var(--ink)' }}>
                {balanceHidden ? '••••••' : `$${formattedBalance ?? (isConnected ? '0.00' : '—')}`}
              </span>
            )}
          </div>

          <div className="mb-2 flex items-center gap-1.5">
            <TokenUSDC variant="branded" size={14} />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {isTestnet ? 'USDC · Testnet' : 'USDC'}
            </span>
          </div>

          {/* EURC balance row */}
          {isConnected && features.eurc && eurcToken?.address && (
            <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }} onClick={onEurc}>
              <span className="flex size-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: '#0052FF' }}>€</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: '#0052FF' }}>
                {balanceHidden ? '••••' : `${fmtEurc} EURC`}
              </span>
              <span className="ml-auto text-[10px] font-semibold text-blue-400">Euro Coin</span>
            </div>
          )}

          {/* USYC balance row */}
          {isConnected && features.usyc && usycToken?.address && (
            <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer hover:opacity-90 transition-opacity" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }} onClick={onUsyc}>
              <span className="flex size-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: '#16A34A' }}>⬡</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: '#16A34A' }}>
                {balanceHidden ? '••••' : `${fmtUsyc} USYC`}
              </span>
              <span className="ml-auto text-[10px] font-semibold text-green-400">US Yield Coin</span>
            </div>
          )}

          {/* cirBTC balance row — testnet only */}
          {isConnected && features.cirbtc && cirbtcToken?.address && (
            <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <span className="flex size-5 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: '#F7931A' }}>₿</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: '#F7931A' }}>
                {balanceHidden ? '••••' : `${fmtCirbtc} cirBTC`}
              </span>
              <span className="ml-auto text-[10px] font-semibold text-amber-400">Circle Bitcoin</span>
            </div>
          )}

          {/* OUSD balance row — gated by ousd feature flag */}
          {isConnected && features.ousd && (
            <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: OUSD_LIGHT, border: `1px solid ${OUSD_BORDER}` }}>
              <OUSDIcon size={20} />
              {!ousdDeployed ? (
                <span className="text-xs font-semibold" style={{ color: OUSD_BLUE }}>
                  OUSD · Coming to Mainnet
                </span>
              ) : ousdBalanceLoading ? (
                <div className="h-3 w-16 animate-pulse rounded" style={{ background: OUSD_BORDER }} />
              ) : (
                <span className="text-xs font-bold tabular-nums" style={{ color: OUSD_BLUE }}>
                  {balanceHidden ? '••••' : `${formattedOusdBalance ?? '0.00'} OUSD`}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={onOusdInfo}
                  className="rounded-lg px-2 py-0.5 text-[10px] font-bold transition-colors hover:opacity-80"
                  style={{ background: OUSD_BORDER, color: OUSD_BLUE }}
                >
                  About
                </button>
                {ousdDeployed && (
                  <button
                    onClick={onOusd}
                    className="rounded-lg px-2 py-0.5 text-[10px] font-bold transition-colors hover:opacity-80"
                    style={{ background: OUSD_BLUE, color: 'white' }}
                  >
                    Swap
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onAddFunds}
              disabled={!isConnected}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <ArrowDownToLine className="size-4" />
              Add funds
            </button>
            <button
              onClick={onSend}
              disabled={!isConnected}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
              style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
            >
              <SendHorizonal className="size-4" />
              Send funds
            </button>
          </div>
        </div>

        {/* Quick action icon row */}
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-around">
            {features.send     && <QuickAction icon={<SendHorizonal className="size-5" />} label="Pay" onClick={onSend} />}
            {features.transfer && <QuickAction icon={<ArrowLeftRight className="size-5" />} label="Transfer" onClick={onTransfer} />}
            {features.receive  && <QuickAction icon={<ArrowDownToLine className="size-5" />} label="Receive" onClick={onReceive} />}
            {features.scanner  && <QuickAction icon={<QrCode className="size-5" />} label="Scan" onClick={onQR} />}
          </div>
          {/* Second row — only render if at least one item is visible */}
          {(features.swap || features.ousd || features.payLinks || features.savings || features.ledger ||
            features.eurc || features.stableFX || features.batchSend || features.usyc) && (
            <div className="mt-3 pt-3 border-t flex flex-wrap justify-around gap-y-2" style={{ borderColor: 'var(--border)' }}>
              {features.swap          && <QuickAction icon={<ArrowUpDown className="size-5" />} label="Swap" onClick={onSwap} />}
              {features.ousd          && <QuickAction icon={<OUSDIcon size={20} />} label="OUSD" onClick={onOusd} />}
              {features.eurc          && <QuickAction icon={<span className="text-blue-700 font-black text-xs">€</span>} label="EURC" onClick={onEurc} />}
              {features.stableFX      && <QuickAction icon={<ArrowUpDown className="size-5 text-green-600" />} label="FX" onClick={onStableFX} />}
              {features.batchSend     && <QuickAction icon={<span className="font-bold text-xs">×N</span>} label="Batch" onClick={onBatchSend} />}
              {features.usyc          && <QuickAction icon={<span className="font-bold text-xs text-amber-600">%</span>} label="USYC" onClick={onUsyc} />}
              {features.payLinks      && <QuickAction icon={<Link2 className="size-5" />} label="Pay Links" onClick={onQRPay} />}
              {features.savings       && <QuickAction icon={<PiggyBank className="size-5" />} label="Savings" onClick={onSavings} />}
              {features.ledger        && <QuickAction icon={<LayoutGrid className="size-5" />} label="Ledger" onClick={onLedger} />}
            </div>
          )}
        </div>
      </div>

      {/* Service tabs card */}
      <div className="mx-4 mt-3 rounded-3xl bg-white p-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
        <ServiceTabs active={serviceTab} onTab={handleServiceTab} />
        {serviceTab === 'savings' && (
          <div className="mt-4 space-y-2">
            {[{ label: 'Flexible', apy: '4.2%', color: '#dcfce7', text: '#16a34a' },
              { label: '30-Day Fixed', apy: '5.8%', color: '#dbeafe', text: '#2563eb' }].map(p => (
              <div key={p.label} className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ background: p.color }}>
                <span className="text-sm font-semibold" style={{ color: p.text }}>{p.label}</span>
                <span className="text-sm font-bold" style={{ color: p.text }}>{p.apy} APY</span>
              </div>
            ))}
          </div>
        )}
        {serviceTab === 'more' && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={onLedger} className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
              <LayoutGrid className="size-5" />
              Statements
            </button>
            <button onClick={onSupport} className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
              <MoreHorizontal className="size-5" />
              Support
            </button>
            <button onClick={onSwap} className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors">
              <ArrowUpDown className="size-5" />
              Swap
            </button>
            {features.ousd && (
              <button onClick={onOusd} className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ background: OUSD_LIGHT, color: OUSD_BLUE }}>
                <OUSDIcon size={20} />
                OpenUSD
              </button>
            )}
            {features.ousd && (
              <button onClick={onOusdInfo} className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ background: OUSD_LIGHT, color: OUSD_BLUE }}>
                <BookOpen className="size-5" />
                Whitepaper
              </button>
            )}
            {features.eurc && (
              <button onClick={onEurc} className="flex flex-col items-center gap-1.5 rounded-xl bg-blue-50 py-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                <span className="text-lg font-black leading-none">€</span>
                EURC
              </button>
            )}
            {features.stableFX && (
              <button onClick={onStableFX} className="flex flex-col items-center gap-1.5 rounded-xl bg-green-50 py-3 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors">
                <ArrowUpDown className="size-5" />
                StableFX
              </button>
            )}
            {features.chainlink && (
              <button onClick={onChainlink} className="flex flex-col items-center gap-1.5 rounded-xl bg-orange-50 py-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors">
                <span className="text-base font-black leading-none">⬡</span>
                Prices
              </button>
            )}
            {features.batchSend && (
              <button onClick={onBatchSend} className="flex flex-col items-center gap-1.5 rounded-xl bg-purple-50 py-3 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors">
                <span className="text-sm font-black leading-none">×N</span>
                Batch
              </button>
            )}
            {features.agentEconomy && (
              <button onClick={onAgent} className="flex flex-col items-center gap-1.5 rounded-xl bg-slate-50 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                <span className="text-base font-black leading-none">⬡</span>
                Agents
              </button>
            )}
            {features.unifiedBalance && (
              <button onClick={onUnified} className="flex flex-col items-center gap-1.5 rounded-xl bg-indigo-50 py-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors">
                <LayoutGrid className="size-5" />
                Unified
              </button>
            )}
            {features.usyc && (
              <button onClick={onUsyc} className="flex flex-col items-center gap-1.5 rounded-xl bg-amber-50 py-3 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                <span className="text-sm font-black leading-none">%</span>
                USYC
              </button>
            )}
          </div>
        )}
      </div>

      {/* Token Portfolio — OKX style */}
      {isConnected && (
        <div className="mx-4 mt-3 rounded-3xl bg-white shadow-sm overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Tokens</h3>
            <span className="text-xs text-slate-400">{isTestnet ? 'Arc Testnet' : 'Arc Mainnet'}</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {/* USDC */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: '#EFF6FF' }}>
                <TokenUSDC variant="branded" size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>USDC</p>
                <p className="text-xs text-slate-400">USD Coin</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {balanceHidden ? '••••' : `$${formattedBalance ?? '0.00'}`}
                </p>
                <p className="text-xs text-slate-400">{balanceHidden ? '••' : `${formattedBalance ?? '0.00'} USDC`}</p>
              </div>
            </div>

            {/* EURC */}
            {features.eurc && eurcToken?.address && (
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={onEurc}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: '#0052FF' }}>€</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>EURC</p>
                  <p className="text-xs text-slate-400">Euro Coin</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {balanceHidden ? '••••' : `${fmtEurc} EURC`}
                  </p>
                  <p className="text-xs text-slate-400">≈ ${fmtEurc}</p>
                </div>
              </div>
            )}

            {/* USYC */}
            {features.usyc && usycToken?.address && (
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={onUsyc}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: '#16A34A' }}>⬡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>USYC</p>
                  <p className="text-xs text-slate-400">US Yield Coin</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {balanceHidden ? '••••' : `${fmtUsyc} USYC`}
                  </p>
                  <p className="text-xs text-slate-400 text-green-500 font-medium">T-Bill yield</p>
                </div>
              </div>
            )}

            {/* cirBTC */}
            {features.cirbtc && cirbtcToken?.address && (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg font-black text-white" style={{ background: '#F7931A' }}>₿</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>cirBTC</p>
                  <p className="text-xs text-slate-400">Circle Bitcoin</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {balanceHidden ? '••••' : `${fmtCirbtc} BTC`}
                  </p>
                  <p className="text-xs text-slate-400">{isTestnet ? 'Testnet' : 'Coming soon'}</p>
                </div>
              </div>
            )}

            {/* OUSD */}
            {features.ousd && (
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={onOusd}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full">
                  <OUSDIcon size={36} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>OUSD</p>
                  <p className="text-xs text-slate-400">OpenPay OpenUSD</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {balanceHidden ? '••••' : `${formattedOusdBalance ?? '0.00'} OUSD`}
                  </p>
                  <p className="text-xs" style={{ color: '#0D47D1' }}>1:1 USD</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent */}
      <div className="mx-4 mt-3 rounded-3xl bg-white p-4 shadow-sm" style={{ border: '1px solid var(--border)' }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>Recent</h3>
            <p className="text-xs text-slate-400">{recentTx.length > 0 ? `${recentTx.length} of ${txHistory.length} latest` : 'No transactions yet'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onLedger} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">Ledger</button>
            {txHistory.length > 3 && (
              <button
                onClick={onSeeAll}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: '#eff6ff', color: '#2563eb' }}
              >
                See all
              </button>
            )}
          </div>
        </div>

        {!isConnected ? (
          <p className="py-3 text-center text-sm text-slate-400">Connect your wallet to see activity</p>
        ) : recentTx.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-400">No transactions yet</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
            {recentTx.map(tx => {
              const avatarColors = [
                ['#dbeafe','#2563eb'],['#dcfce7','#16a34a'],['#fef9c3','#ca8a04'],
                ['#ffe4e6','#dc2626'],['#f3e8ff','#9333ea'],
              ]
              const idx = parseInt(tx.counterparty.slice(2, 4), 16) % avatarColors.length
              const [bg, fg] = avatarColors[idx]
              return (
                <li key={tx.hash} onClick={() => onTxClick(tx)} className="flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-slate-50 rounded-xl px-1 -mx-1">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: bg, color: fg }}>
                    {tx.name ? tx.name.slice(0, 2).toUpperCase() : tx.counterparty.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {tx.name ?? (tx.direction === 'sent' ? 'Sent USDC' : 'Received USDC')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {tx.memo ? `${tx.memo} · ` : ''}
                      {tx.direction === 'sent' ? 'To ' : 'From '}
                      {formatAddress(tx.counterparty)}
                      {' · '}
                      <a href={buildTxExplorerUrl(targetChainId, tx.hash)} target="_blank" rel="noreferrer"
                        className="hover:underline" style={{ color: '#2563eb' }}>
                        {new Date(tx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </a>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="display text-sm font-bold tabular-nums"
                      style={{ color: tx.direction === 'sent' ? 'var(--danger)' : 'var(--success)' }}>
                      {tx.direction === 'sent' ? '-' : '+'}${tx.amount}
                    </span>
                    <p className="text-xs text-slate-400">USDC</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {isTestnet && isConnected && (
          <p className="mt-3 text-center text-xs text-slate-400">
            Testnet — use <span className="font-semibold text-blue-500">"Get test USDC"</span> in the sidebar.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Wallet header button ─────────────────────────────────────────────────────
// Shows address pill when connected (tap → disconnect popover).
// Shows "Connect wallet" via ConnectKit when disconnected.

function WalletHeaderButton() {
  const { address, isConnected } = useAccount()
  const { setOpen } = useModal()
  const { disconnect } = useDisconnect()
  const { mode, setMode } = useNetwork()
  const [showMenu, setShowMenu] = useState(false)

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow transition-all active:scale-95"
        style={{ background: '#1d2f50' }}
      >
        Connect wallet
      </button>
    )
  }

  const short = `${address.slice(0, 6)}····${address.slice(-4)}`
  const isMainnet = mode === 'mainnet'

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(v => !v)}
        className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow transition-all active:scale-95"
        style={{ background: '#1d2f50' }}
      >
        <span className="size-5 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shrink-0" />
        <span className="hidden xs:inline">{short}</span>
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-xl border overflow-hidden"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 220 }}
          >
            {/* Address */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs text-slate-400 mb-0.5">Connected</p>
              <p className="font-mono text-sm font-semibold" style={{ color: 'var(--ink)' }}>{short}</p>
            </div>
            {/* Network selector */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs text-slate-400 mb-2">Network</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('testnet'); setShowMenu(false) }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: !isMainnet ? '#0D47D1' : 'var(--bg)',
                    color: !isMainnet ? '#fff' : 'var(--muted)',
                    border: `1px solid ${!isMainnet ? '#0D47D1' : 'var(--border)'}`,
                  }}
                >
                  Testnet
                </button>
                <button
                  onClick={() => { setMode('mainnet'); setShowMenu(false) }}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: isMainnet ? '#0D47D1' : 'var(--bg)',
                    color: isMainnet ? '#fff' : 'var(--muted)',
                    border: `1px solid ${isMainnet ? '#0D47D1' : 'var(--border)'}`,
                  }}
                >
                  Mainnet
                </button>
              </div>
            </div>
            {/* Disconnect */}
            <button
              onClick={() => { disconnect(); setShowMenu(false) }}
              className="w-full px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const { chainId: targetChainId, isTestnet, mode, setMode, features } = useNetwork()
  const { address } = useAccount()
  const [sendOpen, setSendOpen] = useState(false)
  const [sendPrefill, setSendPrefill] = useState<string | undefined>()
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferPrefill, setTransferPrefill] = useState<string | undefined>()
  const [adminOpen, setAdminOpen] = useState(false)
  const [addFundsOpen, setAddFundsOpen] = useState(false)
  const [savingsOpen, setSavingsOpen]   = useState(false)
  const [ledgerOpen,  setLedgerOpen]    = useState(false)
  const [swapOpen,    setSwapOpen]      = useState(false)
  const [qrPayOpen,   setQrPayOpen]     = useState(false)
  const [ousdOpen,    setOusdOpen]      = useState(false)
  const [ousdInfoOpen, setOusdInfoOpen] = useState(false)
  const [eurcOpen,    setEurcOpen]      = useState(false)
  const [stableFXOpen, setStableFXOpen] = useState(false)
  const [chainlinkOpen, setChainlinkOpen] = useState(false)
  const [batchSendOpen, setBatchSendOpen] = useState(false)
  const [agentOpen,   setAgentOpen]     = useState(false)
  const [unifiedOpen, setUnifiedOpen]   = useState(false)
  const [usycOpen,    setUsycOpen]      = useState(false)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NavTab>('home')
  const [txHistory, setTxHistory] = useState<TxRecord[]>([])
  const [mainnetDismissed, setMainnetDismissed] = useState(false)
  const [receiptTx, setReceiptTx] = useState<TxRecord | null>(null)
  const [termsOpen, setTermsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [openPayOpen, setOpenPayOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const { account: openPayAccount } = useOpenPayAccount()
  const [mainnetConfirmOpen, setMainnetConfirmOpen] = useState(false)
  const { accepted: termsAccepted, accept: acceptTerms } = useTermsAccepted()
  const [termsGateOpen, setTermsGateOpen] = useState(!termsAccepted)

  const addTx = useCallback((tx: TxRecord) => {
    setTxHistory(prev => [tx, ...prev.filter(t => t.hash !== tx.hash).slice(0, 49)])
  }, [])

  const usdcFact = getUsdc(targetChainId)
  const USDC_ADDRESS = (usdcFact?.address ?? '0x0') as `0x${string}`

  const { data: rawBalance, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(address) && Boolean(usdcFact), refetchInterval: 8_000 },
  })

  // Clear tx history on network switch
  useEffect(() => { setTxHistory([]) }, [mode])

  // Track balance increases for incoming txs
  const [prevRaw, setPrevRaw] = useState<bigint | null>(null)
  useEffect(() => {
    if (rawBalance != null && prevRaw != null) {
      const diff = rawBalance - prevRaw
      if (diff > 0n && address) {
        addTx({
          hash: '0x' + Math.random().toString(16).slice(2).padEnd(64, '0'),
          direction: 'received',
          amount: Amount.fromRaw(diff, usdcDecimalsFor(targetChainId)).toFixed(2),
          counterparty: '0x0000000000000000000000000000000000000000',
          timestamp: Date.now(),
        })
      }
    }
    setPrevRaw(rawBalance ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawBalance])

  const handleSendClose = () => { setSendOpen(false); setSendPrefill(undefined); void refetch() }
  const handleTransferClose = () => { setTransferOpen(false); setTransferPrefill(undefined); void refetch() }

  // Scanner → pre-fill send sheet with scanned address
  const handleScanResult = (addr: string) => {
    setScannerOpen(false)
    // Small delay lets the scanner slide out before the send sheet slides in
    setTimeout(() => {
      setSendPrefill(addr)
      setSendOpen(true)
    }, 320)
  }

  const openScanner = () => setScannerOpen(true)

  const inboxCount = txHistory.filter(t => t.direction === 'received').length

  return (
    <div className="app-shell">

      {/* ── Top header ──────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 w-full"
        style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        {/* Mainnet warning */}
        <AnimatePresence>
          {!isTestnet && !mainnetDismissed && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex items-center gap-2 bg-red-50 px-4 py-2" style={{ borderBottom: '1px solid rgba(220,38,38,0.12)' }}>
                <AlertTriangle className="size-3.5 shrink-0 text-red-500" />
                <p className="flex-1 text-xs font-medium text-red-600">Mainnet active — real USDC. Transactions are irreversible.</p>
                <button onClick={() => setMainnetDismissed(true)}><X className="size-3.5 text-red-400" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 1 — brand + actions */}
        <div className="flex items-center justify-between px-3 sm:px-4 pt-3 pb-1 gap-2">
          {/* Brand mark */}
          <div className="flex items-center gap-2">
            <span className="display text-base font-extrabold tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              OpenPay<span style={{ color: '#2563eb' }}> Arc</span>
            </span>

            {/* ── Network switcher pill ── */}
            <div
              className="flex items-center rounded-full p-0.5 text-[11px] font-bold"
              style={{ background: '#f1f5f9', border: '1px solid rgba(0,0,0,0.07)' }}
            >
              <button
                onClick={() => setMode('testnet')}
                className="rounded-full px-2.5 py-0.5 transition-all"
                style={isTestnet
                  ? { background: '#2563eb', color: '#fff', boxShadow: '0 1px 4px rgba(37,99,235,0.3)' }
                  : { color: '#64748b' }}
              >
                Test
              </button>
              <button
                onClick={() => setMainnetConfirmOpen(true)}
                className="rounded-full px-2.5 py-0.5 transition-all"
                style={!isTestnet
                  ? { background: '#16a34a', color: '#fff', boxShadow: '0 1px 4px rgba(22,163,74,0.3)' }
                  : { color: '#64748b' }}
              >
                Main
              </button>
            </div>
          </div>

          {/* Right icons */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Notification bell */}
            <button
              onClick={() => setActiveTab('inbox')}
              className="relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-slate-100 active:scale-95"
              style={{ color: 'var(--muted)' }}
            >
              <Bell className="size-[18px]" />
              {inboxCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
                  {inboxCount > 9 ? '9+' : inboxCount}
                </span>
              )}
            </button>

            {/* Wallet connect */}
            <WalletHeaderButton />
          </div>
        </div>

        {/* Row 2 — wallet identity */}
        {address ? (
          <div className="flex items-center gap-2 px-3 sm:px-4 pb-2 pt-1">
            {/* Avatar */}
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white"
              style={{ background: 'linear-gradient(135deg,#dbeafe,#ede9fe)', color: '#2563eb', boxShadow: '0 0 0 2px #bfdbfe' }}
            >
              {address.slice(2, 4).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                {formatAddress(address)}
              </p>
              <p className="mono truncate text-[10px] text-slate-400">
                {address.slice(0, 14)}...{address.slice(-6)}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}
            >
              Active
            </span>
          </div>
        ) : (
          <div className="px-3 sm:px-4 pb-2 pt-1">
            <p className="text-xs text-slate-400">Connect your wallet to get started</p>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────── */}
      <main className="relative pb-32 pt-3" style={{ paddingLeft: 'env(safe-area-inset-left,0px)', paddingRight: 'env(safe-area-inset-right,0px)' }}>
        {activeTab === 'home' && (
          <HomeScreen
            txHistory={txHistory}
            onSend={() => setSendOpen(true)}
            onAddFunds={() => setAddFundsOpen(true)}
            onReceive={() => setReceiveOpen(true)}
            onQR={openScanner}
            onTransfer={() => setTransferOpen(true)}
            onSeeAll={() => setActiveTab('transactions')}
            onSavings={() => setSavingsOpen(true)}
            onLedger={() => setLedgerOpen(true)}
            onSwap={() => setSwapOpen(true)}
            onQRPay={() => setQrPayOpen(true)}
            onSupport={() => setSupportOpen(true)}
            onOusd={() => setOusdOpen(true)}
            onOusdInfo={() => setOusdInfoOpen(true)}
            onEurc={() => setEurcOpen(true)}
            onStableFX={() => setStableFXOpen(true)}
            onChainlink={() => setChainlinkOpen(true)}
            onBatchSend={() => setBatchSendOpen(true)}
            onAgent={() => setAgentOpen(true)}
            onUnified={() => setUnifiedOpen(true)}
            onUsyc={() => setUsycOpen(true)}
            onTxClick={setReceiptTx}
          />
        )}
        {activeTab === 'inbox' && <InboxTab txHistory={txHistory} onTxClick={setReceiptTx} />}
        {activeTab === 'transactions' && <TransactionsTab txHistory={txHistory} chainId={targetChainId} onLedger={() => setLedgerOpen(true)} onTxClick={setReceiptTx} />}
        {activeTab === 'profile' && <ProfileTab onAdmin={() => setAdminOpen(true)} onTerms={() => setTermsOpen(true)} onPrivacy={() => setPrivacyOpen(true)} onOpenPay={() => setOpenPayOpen(true)} openPayConnected={!!openPayAccount} onSupport={() => setSupportOpen(true)} onOusdInfo={() => setOusdInfoOpen(true)} onOusd={() => setOusdOpen(true)} />}
      </main>

      {/* ── Bottom nav ───────────────────────────────────────────── */}
      <BottomNav
        active={activeTab}
        onTab={setActiveTab}
        onQR={openScanner}
        inboxCount={inboxCount}
      />

      {/* ── Sheets ──────────────────────────────────────────────── */}
      <SendSheet
        key={sendPrefill ?? 'send'}
        open={sendOpen}
        onClose={handleSendClose}
        prefillTo={sendPrefill}
        onTxSent={addTx}
      />
      <ReceiveSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <AddFundsModal
        open={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        onBridge={() => setBridgeOpen(true)}
      />
      <BridgeSheet open={bridgeOpen} onClose={() => setBridgeOpen(false)} />
      <ScannerPage open={scannerOpen} onClose={() => setScannerOpen(false)} onSendTo={handleScanResult} />
      <TransferSheet
        open={transferOpen}
        onClose={handleTransferClose}
        prefillTo={transferPrefill}
        onTxSent={addTx}
      />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      <LedgerSheet open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
      <SwapSheet open={swapOpen} onClose={() => setSwapOpen(false)} />
      <QRPaySheet open={qrPayOpen} onClose={() => setQrPayOpen(false)} />
      <OUSDSwapSheet open={ousdOpen} onClose={() => setOusdOpen(false)} />
      <OUSDInfoSheet open={ousdInfoOpen} onClose={() => setOusdInfoOpen(false)} onSwap={() => { setOusdInfoOpen(false); setTimeout(() => setOusdOpen(true), 220) }} />
      {features.eurc && <EURCSheet open={eurcOpen} onClose={() => setEurcOpen(false)} />}
      {features.stableFX && <StableFXSheet open={stableFXOpen} onClose={() => setStableFXOpen(false)} />}
      {features.chainlink && <ChainlinkSheet open={chainlinkOpen} onClose={() => setChainlinkOpen(false)} />}
      {features.batchSend && <BatchSendSheet open={batchSendOpen} onClose={() => setBatchSendOpen(false)} />}
      {features.agentEconomy && <AgentSheet open={agentOpen} onClose={() => setAgentOpen(false)} />}
      {features.unifiedBalance && <UnifiedBalanceSheet open={unifiedOpen} onClose={() => setUnifiedOpen(false)} />}
      {features.usyc && <USYCSheet open={usycOpen} onClose={() => setUsycOpen(false)} />}
      <SavingsSheet
        open={savingsOpen}
        onClose={() => setSavingsOpen(false)}
        savingsAddress={(import.meta.env.VITE_SAVINGS_CONTRACT_TESTNET ?? '0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523') as `0x${string}`}
      />

      {/* Transaction receipt */}
      <TxReceiptModal tx={receiptTx} onClose={() => setReceiptTx(null)} />

      {/* Legal */}
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
      <PrivacyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <OpenPayConnect open={openPayOpen} onClose={() => setOpenPayOpen(false)} />
      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />

      {/* Mainnet switch confirmation modal */}
      <AnimatePresence>
        {mainnetConfirmOpen && (
          <>
            <motion.div key="mn-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50" style={{ backdropFilter: 'blur(6px)' }}
              onClick={() => setMainnetConfirmOpen(false)} />
            <div className="fixed inset-0 z-[60] flex items-center justify-center px-5 pointer-events-none">
              <motion.div
                key="mn-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                className="w-full max-w-xs overflow-hidden rounded-3xl bg-white pointer-events-auto"
                style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}
              >
                {/* Red warning strip */}
                <div className="h-1.5" style={{ background: 'linear-gradient(90deg,#ef4444,#f97316,#eab308)' }} />
                <div className="p-6">
                  {/* Icon */}
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full" style={{ background: '#fef2f2' }}>
                    <AlertTriangle className="size-7 text-red-500" />
                  </div>
                  <h2 className="text-center text-lg font-bold" style={{ color: 'var(--ink)' }}>Switch to Mainnet?</h2>
                  <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
                    You are about to switch to <span className="font-semibold text-green-700">Arc Mainnet</span>.
                    This uses <span className="font-semibold">real USDC</span> with real monetary value.
                    Transactions are <span className="font-semibold text-red-600">irreversible</span>.
                  </p>
                  <div className="mt-3 rounded-xl px-4 py-3 text-xs text-red-700" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    Double-check all addresses and amounts before confirming any transaction on mainnet.
                  </div>
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() => setMainnetConfirmOpen(false)}
                      className="flex-1 rounded-2xl py-3 text-sm font-semibold transition-all hover:bg-slate-100"
                      style={{ background: '#f1f5f9', color: 'var(--ink)' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setMode('mainnet'); setMainnetConfirmOpen(false); setMainnetDismissed(false) }}
                      className="flex-1 rounded-2xl py-3 text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{ background: '#16a34a' }}
                    >
                      Switch to Mainnet
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* First-run terms gate — non-dismissable until accepted */}
      <TermsModal
        open={termsGateOpen && !termsAccepted}
        onClose={() => { /* must accept to proceed */ }}
        onAccept={() => { acceptTerms(); setTermsGateOpen(false) }}
      />
    </div>
  )
}
