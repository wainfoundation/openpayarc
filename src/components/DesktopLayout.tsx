import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Home, ArrowUpDown, Send, Repeat2, LayoutGrid, Bell, ChevronDown, RefreshCw } from 'lucide-react'
import { useNetwork } from '../NetworkContext'
import { formatUnits } from 'viem'
import { useReadContract, useBalance } from 'wagmi'
import { useNetworkFee } from '../hooks/useNetworkFee'

/* ── USDC addresses ─────────────────────────────────────────────────── */
const USDC_ADDRESS: Record<number, `0x${string}`> = {
  5042002: '0x3600000000000000000000000000000000000000',
  5042:    '0x3600000000000000000000000000000000000000',
}
const USDC_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const

/* ── Nav item type ──────────────────────────────────────────────────── */
type NavItem = 'home' | 'earn' | 'swap' | 'send' | 'agent' | 'discover'

interface DesktopLayoutProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onSend: () => void
  onAddFunds: () => void
  onSwap: () => void
  onBridge: () => void
  onLedger: () => void
  onSavings: () => void
  onAdminOpen: () => void
  txHistory: Array<{
    hash: string
    direction: 'sent' | 'received'
    amount: string
    counterparty: string
    timestamp: number
    memo?: string
  }>
  onTxClick: (tx: { hash: string; direction: 'sent' | 'received'; amount: string; counterparty: string; timestamp: number; memo?: string }) => void
  isTestnet: boolean
  setMode: (m: 'testnet' | 'mainnet') => void
  _onMainnetConfirm: () => void
  mainnetDismissed: boolean
  setMainnetDismissed: (v: boolean) => void
  inboxCount: number
}

export function DesktopLayout({
  onSend, onAddFunds, onSwap, onBridge, onLedger, onSavings, onAdminOpen,
  txHistory, onTxClick, isTestnet, _onMainnetConfirm, mainnetDismissed, setMainnetDismissed, inboxCount,
}: DesktopLayoutProps) {
  const { address } = useAccount()
  const { chainId } = useNetwork()
  const [navActive, setNavActive] = useState<NavItem>('home')
  const [assetsTab, setAssetsTab] = useState<'assets' | 'transactions'>('assets')
  const { feeUSDC: feeString } = useNetworkFee()

  /* ── Live USDC balance ─────────────────────────────────────────────── */
  const usdcAddr = USDC_ADDRESS[chainId]
  const { data: usdcRaw } = useReadContract({
    address: usdcAddr,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const { data: nativeBal } = useBalance({ address, query: { enabled: !!address, refetchInterval: 8000 } })

  const usdcBalance = usdcRaw !== undefined ? Number(formatUnits(usdcRaw, 6)) : null
  const nativeBalance = nativeBal ? Number(formatUnits(nativeBal.value, 18)) : null
  const displayBalance = usdcBalance ?? nativeBalance ?? 0

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null

  /* ── Top nav items ─────────────────────────────────────────────────── */
  const navItems: { id: NavItem; label: string; icon: React.ReactNode; onClick?: () => void }[] = [
    { id: 'home', label: 'Home', icon: <Home className="size-4" /> },
    { id: 'earn', label: 'Earn', icon: <LayoutGrid className="size-4" />, onClick: onSavings },
    { id: 'swap', label: 'Swap', icon: <ArrowUpDown className="size-4" />, onClick: onSwap },
    { id: 'send', label: 'Send', icon: <Send className="size-4" />, onClick: onSend },
    { id: 'agent', label: 'Bridge', icon: <Repeat2 className="size-4" />, onClick: onBridge },
    { id: 'discover', label: 'Discover', icon: <LayoutGrid className="size-4" /> },
  ]

  return (
    <div className="desktop-shell">
      {/* ── Mainnet warning ──────────────────────────────────────────── */}
      {!isTestnet && !mainnetDismissed && (
        <div className="flex items-center justify-center gap-2 px-6 py-2 text-xs font-medium"
          style={{ background: 'rgba(220,38,38,0.15)', color: '#fca5a5', borderBottom: '1px solid rgba(220,38,38,0.2)' }}>
          <span>⚠ Mainnet active — real USDC. Transactions are irreversible.</span>
          <button onClick={() => setMainnetDismissed(true)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Top nav bar ──────────────────────────────────────────────── */}
      <header className="desktop-topbar">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>
            <span className="text-xs font-black text-white">O</span>
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            OpenPay<span style={{ color: '#60a5fa' }}> Arc</span>
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex items-center gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setNavActive(item.id); item.onClick?.() }}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all"
              style={navActive === item.id
                ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                : { color: 'rgba(255,255,255,0.55)', background: 'transparent' }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Network badge */}
          <div className="flex items-center rounded-full px-3 py-1.5 text-xs font-semibold"
            style={isTestnet
              ? { background: 'rgba(37,99,235,0.2)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }
              : { background: 'rgba(22,163,74,0.2)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>
            <span className="mr-1.5 size-1.5 rounded-full inline-block"
              style={{ background: isTestnet ? '#60a5fa' : '#4ade80' }} />
            {isTestnet ? 'Testnet' : 'Mainnet'}
          </div>

          {/* Notification */}
          <button onClick={onAdminOpen}
            className="relative flex size-9 items-center justify-center rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <Bell className="size-4" />
            {inboxCount > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{inboxCount}</span>
            )}
          </button>

          {/* Connect / address */}
          <ConnectKitButton.Custom>
            {({ isConnected, show, address: ckAddr, ensName }) => (
              <button onClick={show}
                className="flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                {isConnected ? (
                  <>
                    <span className="size-2 rounded-full bg-green-400" />
                    {ensName ?? (ckAddr ? `${ckAddr.slice(0,6)}…${ckAddr.slice(-4)}` : '')}
                  </>
                ) : 'Connect Wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="desktop-content">

        {/* ── Balance hero ─────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="mb-1 flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Portfolio balance
            <button className="rounded transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <RefreshCw className="size-3.5" />
            </button>
          </div>
          <div className="mb-6 flex items-end justify-between">
            <div>
              <span className="text-5xl font-bold tracking-tight text-white">
                {address ? `$${fmt(displayBalance)}` : '$—'}
              </span>
              {shortAddr && (
                <p className="mt-1 text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{shortAddr}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onSend}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' }}>
                <Send className="size-4" /> Send
              </button>
              <button onClick={onAddFunds}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' }}>
                + Add funds
              </button>
              <button onClick={onBridge}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' }}>
                <Repeat2 className="size-4" /> Bridge
              </button>
            </div>
          </div>

          {/* Promo banner */}
          <div className="relative overflow-hidden rounded-2xl p-6"
            style={{ background: 'linear-gradient(135deg,#1e3a5f 0%,#1e1b4b 60%,#0f172a 100%)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div className="relative z-10">
              <h3 className="mb-1 text-lg font-bold text-white">Save USDC on Arc</h3>
              <p className="mb-4 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Earn up to 8.5% APY with fixed savings plans. Powered by smart contracts.</p>
              <button onClick={onSavings}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                Start earning
              </button>
            </div>
            {/* Decorative circle */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
              <div className="size-32 rounded-full" style={{ background: 'radial-gradient(circle,#60a5fa,transparent)' }} />
            </div>
          </div>
        </div>

        {/* ── Assets / Transactions tabs ────────────────────────────── */}
        <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {(['assets', 'transactions'] as const).map(t => (
                <button key={t} onClick={() => setAssetsTab(t)}
                  className="rounded-lg px-5 py-2 text-sm font-medium capitalize transition-all"
                  style={assetsTab === t
                    ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                    : { color: 'rgba(255,255,255,0.45)' }}>
                  {t === 'assets' ? 'My assets' : 'Transactions'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onLedger}
                className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Ledger
              </button>
              <button className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                All networks <ChevronDown className="size-3.5" />
              </button>
            </div>
          </div>

          {assetsTab === 'assets' ? (
            /* Assets list */
            <div>
              {address ? (
                <div className="flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-white/5">
                  {/* USDC icon */}
                  <div className="relative size-10 shrink-0">
                    <div className="size-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#2775ca,#1a56a0)' }}>
                      <span className="text-sm font-bold text-white">$</span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full flex items-center justify-center" style={{ background: '#0a0f1e', border: '1.5px solid rgba(255,255,255,0.1)' }}>
                      <span className="text-[7px] font-bold text-blue-400">A</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">USDC</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{isTestnet ? 'Arc Testnet' : 'Arc'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">${fmt(displayBalance)}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{fmt(displayBalance)} USDC</p>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <p className="text-sm">Connect your wallet to see assets</p>
                </div>
              )}
              {feeString && (
                <p className="mt-4 text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Network fee: ~{feeString} USDC
                </p>
              )}
            </div>
          ) : (
            /* Transactions list */
            <div>
              {txHistory.length === 0 ? (
                <div className="py-12 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {txHistory.slice(0, 20).map(tx => (
                    <button key={tx.hash} onClick={() => onTxClick(tx)}
                      className="flex w-full items-center gap-4 rounded-xl p-4 text-left transition-colors hover:bg-white/5">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold
                        ${tx.direction === 'received' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {tx.direction === 'received' ? '↓' : '↑'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm">{tx.direction === 'received' ? 'Received USDC' : 'Sent USDC'}</p>
                        <p className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {tx.direction === 'received' ? 'From' : 'To'} {tx.counterparty.slice(0, 10)}…{tx.counterparty.slice(-6)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold text-sm ${tx.direction === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                          {tx.direction === 'received' ? '+' : '-'}${Number(tx.amount).toFixed(2)}
                        </p>
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {new Date(tx.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className="mt-12 pb-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          <div className="mb-3 flex justify-center gap-4 flex-wrap">
            {['Terms', 'Privacy', 'Support', 'arc.io'].map(l => (
              <button key={l} className="hover:text-white/50 transition-colors">{l}</button>
            ))}
          </div>
          <p>OpenPay Arc is a non-custodial USDC wallet. Not a financial service. Powered by Circle · Arc · LiFi.</p>
          <p className="mt-1">© 2026 OpenPay Arc. All rights reserved.</p>
        </footer>
      </main>
    </div>
  )
}
