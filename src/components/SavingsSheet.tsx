/**
 * SavingsSheet — full savings UI for OpenPaySavings contract.
 * Three plans: Flexible (4.2% APY), 30-Day Fixed (5.8%), 90-Day Fixed (8.5%)
 * Features: deposit, withdraw, claim interest, live position display.
 */
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, PiggyBank, TrendingUp, Lock, Unlock, ArrowDownToLine,
  ArrowUpFromLine, Sparkles, ChevronRight, Loader2, AlertCircle,
  CheckCircle2, ExternalLink, Clock, Info,
} from 'lucide-react'
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { useNetwork } from '@/NetworkContext'

// ─── Stable timestamp hook (avoids Date.now() impurity in render) ───────────

function useNowSec(): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)))
    }, 10_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])
  return now
}

// ─── Contract ABI (subset) ──────────────────────────────────────────────────

const SAVINGS_ABI = [
  { name: 'deposit',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }, { name: 'amount', type: 'uint128' }], outputs: [] },
  { name: 'withdraw',        type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }], outputs: [] },
  { name: 'claimInterest',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }], outputs: [] },
  { name: 'getPosition',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }, { name: 'plan', type: 'uint8' }], outputs: [{ name: 'principal', type: 'uint128' }, { name: 'interest', type: 'uint128' }, { name: 'depositedAt', type: 'uint64' }, { name: 'lockEndsAt', type: 'uint64' }] },
  { name: 'pendingInterest', type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }, { name: 'plan', type: 'uint8' }], outputs: [{ type: 'uint128' }] },
  { name: 'totalDeposited',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'reserveBalance',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
] as const

// ─── Plan metadata ──────────────────────────────────────────────────────────

const PLANS = [
  { id: 0, label: 'Flexible',     apy: '4.2%', apyNum: 4.2, lock: 'No lock',   lockDays: 0,  color: '#dcfce7', text: '#16a34a', border: '#bbf7d0', icon: <Unlock className="size-5" /> },
  { id: 1, label: '30-Day Fixed', apy: '5.8%', apyNum: 5.8, lock: '30 days',   lockDays: 30, color: '#dbeafe', text: '#2563eb', border: '#bfdbfe', icon: <Lock className="size-5" /> },
  { id: 2, label: '90-Day Fixed', apy: '8.5%', apyNum: 8.5, lock: '90 days',   lockDays: 90, color: '#f3e8ff', text: '#9333ea', border: '#e9d5ff', icon: <Lock className="size-5" /> },
] as const

type PlanId = 0 | 1 | 2
type ActionMode = 'deposit' | 'withdraw' | 'claim'

const spectral = 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)'
const spring   = { type: 'spring' as const, damping: 28, stiffness: 280 }

function fmt(raw: bigint | undefined, dec = 6): string {
  if (raw == null) return '0.00'
  return Number(formatUnits(raw, dec)).toFixed(2)
}

function countdown(lockEndsAt: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const diff = Number(lockEndsAt - now)
  if (diff <= 0) return 'Matured'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h remaining`
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m remaining`
}

// ─── Plan card ───────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: (typeof PLANS)[number]
  selected: boolean
  onSelect: () => void
  principal: bigint
  interest: bigint
  lockEndsAt: bigint
  usdcDecimals: number
  nowSec: bigint
}

function PlanCard({ plan, selected, onSelect, principal, interest, lockEndsAt, usdcDecimals, nowSec }: PlanCardProps) {
  const hasPosition = principal > 0n
  const isMatured   = lockEndsAt > 0n && nowSec >= lockEndsAt
  const isLocked    = lockEndsAt > 0n && !isMatured

  return (
    <button
      onClick={onSelect}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background: selected ? plan.color : 'white',
        border: `1.5px solid ${selected ? plan.border : 'var(--border)'}`,
        boxShadow: selected ? `0 4px 16px ${plan.border}` : '0 1px 4px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: plan.color, color: plan.text }}>
            {plan.icon}
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{plan.label}</p>
            <p className="text-xs" style={{ color: plan.text }}>{plan.apy} APY · {plan.lock}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-extrabold tabular-nums" style={{ color: plan.text }}>
            {plan.apy}
          </p>
          <p className="text-[10px] text-slate-400">APY</p>
        </div>
      </div>

      {hasPosition && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Deposited</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>${fmt(principal, usdcDecimals)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-slate-500">Interest earned</span>
            <span className="font-bold tabular-nums" style={{ color: plan.text }}>+${fmt(interest, usdcDecimals)}</span>
          </div>
          {isLocked && (
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Clock className="size-3" />
              {countdown(lockEndsAt)}
            </div>
          )}
          {isMatured && (
            <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="size-3" />
              Ready to withdraw
            </div>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Action panel ────────────────────────────────────────────────────────────

interface ActionPanelProps {
  plan: (typeof PLANS)[number]
  mode: ActionMode
  setMode: (m: ActionMode) => void
  savingsAddress: `0x${string}`
  usdcAddress: `0x${string}`
  usdcDecimals: number
  chainId: number
  principal: bigint
  interest: bigint
  lockEndsAt: bigint
  walletBalance: bigint
  onSuccess: () => void
  nowSec: bigint
}

function ActionPanel({
  plan, mode, setMode,
  savingsAddress, usdcAddress, usdcDecimals, chainId,
  principal, interest, lockEndsAt,
  walletBalance, onSuccess, nowSec,
}: ActionPanelProps) {
  const [amount, setAmount]   = useState('')
  const [step, setStep]       = useState<'input' | 'approve' | 'tx'>('input')
  const [txError, setTxError] = useState<string | null>(null)
  const [prevSuccess, setPrevSuccess] = useState(false)

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isLocked   = lockEndsAt > 0n && nowSec < lockEndsAt
  const hasPos     = principal > 0n

  // Detect rising edge of isSuccess without setState-in-effect
  if (isSuccess && !prevSuccess) {
    setPrevSuccess(true)
    onSuccess()
    setAmount('')
    setStep('input')
    setTxError(null)
  }
  if (!isSuccess && prevSuccess) setPrevSuccess(false)

  const handleDeposit = () => {
    if (!amount || Number(amount) <= 0) return
    const raw = parseUnits(amount, usdcDecimals)
    setTxError(null)
    setStep('approve')
    writeContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [savingsAddress, raw],
      chainId,
    }, {
      onSuccess: () => {
        setStep('tx')
        writeContract({
          address: savingsAddress,
          abi: SAVINGS_ABI,
          functionName: 'deposit',
          args: [plan.id, BigInt(raw)],
          chainId,
        }, {
          onError: (e) => { setTxError(e.message.split('\n')[0] ?? 'Transaction failed'); setStep('input'); reset() },
        })
      },
      onError: (e) => { setTxError(e.message.split('\n')[0] ?? 'Approval failed'); setStep('input'); reset() },
    })
  }

  const handleWithdraw = () => {
    setTxError(null)
    writeContract({
      address: savingsAddress,
      abi: SAVINGS_ABI,
      functionName: 'withdraw',
      args: [plan.id],
      chainId,
    }, {
      onError: (e) => { setTxError(e.message.split('\n')[0] ?? 'Transaction failed') },
    })
  }

  const handleClaim = () => {
    setTxError(null)
    writeContract({
      address: savingsAddress,
      abi: SAVINGS_ABI,
      functionName: 'claimInterest',
      args: [plan.id],
      chainId,
    }, {
      onError: (e) => { setTxError(e.message.split('\n')[0] ?? 'Transaction failed') },
    })
  }

  const explorerUrl = hash ? buildTxExplorerUrl(chainId, hash) : null

  if (isSuccess) {
    return (
      <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl bg-green-50 p-5 text-center" style={{ border: '1px solid #bbf7d0' }}>
        <CheckCircle2 className="mx-auto size-10 text-green-500" />
        <p className="mt-3 font-bold text-green-700">
          {mode === 'deposit' ? 'Deposit successful!' : mode === 'withdraw' ? 'Withdrawal complete!' : 'Interest claimed!'}
        </p>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1 text-xs text-green-600 hover:underline">
            View on explorer <ExternalLink className="size-3" />
          </a>
        )}
      </motion.div>
    )
  }

  const busy = isPending || confirming

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex rounded-xl p-1" style={{ background: '#f1f5f9' }}>
        {(['deposit', ...(hasPos ? ['withdraw'] : []), ...(hasPos && plan.id === 0 ? ['claim'] : [])] as ActionMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 rounded-lg py-2 text-xs font-bold capitalize transition-all"
            style={{
              background: mode === m ? 'white' : 'transparent',
              color: mode === m ? plan.text : '#94a3b8',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'deposit' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Amount (USDC)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border py-3 pl-8 pr-16 text-sm font-bold outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: '#f8faff', ['--tw-ring-color' as string]: plan.border }}
              />
              <button
                onClick={() => setAmount(fmt(walletBalance, usdcDecimals))}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold"
                style={{ background: plan.color, color: plan.text }}
              >Max</button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Wallet balance: ${fmt(walletBalance, usdcDecimals)} USDC</p>
          </div>
          {amount && Number(amount) > 0 && (
            <div className="rounded-xl p-3 text-xs" style={{ background: plan.color }}>
              <p className="font-semibold" style={{ color: plan.text }}>
                Estimated annual yield: ${(Number(amount) * plan.apyNum / 100).toFixed(2)} USDC
              </p>
              {plan.lockDays > 0 && <p className="mt-0.5 opacity-75" style={{ color: plan.text }}>Locked for {plan.lockDays} days after deposit</p>}
            </div>
          )}
          <button
            onClick={handleDeposit}
            disabled={busy || !amount || Number(amount) <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: step === 'approve' ? '#f59e0b' : `linear-gradient(135deg,${plan.text},${plan.text}dd)` }}
          >
            {busy ? <><Loader2 className="size-4 animate-spin" />{step === 'approve' ? 'Approving USDC...' : 'Depositing...'}</> : <><ArrowDownToLine className="size-4" />Deposit {amount ? `$${Number(amount).toFixed(2)}` : ''}</>}
          </button>
        </div>
      )}

      {mode === 'withdraw' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: plan.color, border: `1px solid ${plan.border}` }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: plan.text }}>Principal</span>
              <span className="font-bold" style={{ color: plan.text }}>${fmt(principal, usdcDecimals)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span style={{ color: plan.text }}>+ Interest</span>
              <span className="font-bold" style={{ color: plan.text }}>+${fmt(interest, usdcDecimals)}</span>
            </div>
            <div className="mt-2 border-t pt-2 flex justify-between text-sm font-extrabold" style={{ borderColor: plan.border, color: plan.text }}>
              <span>Total</span>
              <span>${fmt(principal + interest, usdcDecimals)}</span>
            </div>
          </div>
          {isLocked && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3" style={{ border: '1px solid #fde68a' }}>
              <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-xs font-semibold text-amber-700">Plan still locked</p>
                <p className="text-xs text-amber-600">{countdown(lockEndsAt)}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleWithdraw}
            disabled={busy || isLocked}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}
          >
            {busy ? <><Loader2 className="size-4 animate-spin" />Withdrawing...</> : <><ArrowUpFromLine className="size-4" />Withdraw all</>}
          </button>
        </div>
      )}

      {mode === 'claim' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4 text-center" style={{ background: plan.color, border: `1px solid ${plan.border}` }}>
            <p className="text-xs font-semibold" style={{ color: plan.text }}>Claimable interest</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: plan.text }}>+${fmt(interest, usdcDecimals)}</p>
            <p className="text-xs mt-0.5 opacity-70" style={{ color: plan.text }}>USDC</p>
          </div>
          <button
            onClick={handleClaim}
            disabled={busy || interest === 0n}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${plan.text},${plan.text}dd)` }}
          >
            {busy ? <><Loader2 className="size-4 animate-spin" />Claiming...</> : <><Sparkles className="size-4" />Claim ${fmt(interest, usdcDecimals)} USDC</>}
          </button>
        </div>
      )}

      {txError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3" style={{ border: '1px solid rgba(220,38,38,0.15)' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <p className="text-xs text-red-600">{txError}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main sheet ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  savingsAddress: `0x${string}` | null
}

export default function SavingsSheet({ open, onClose, savingsAddress }: Props) {
  const { chainId: targetChainId } = useNetwork()
  const { address } = useAccount()
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(0)
  const [actionMode, setActionMode]     = useState<ActionMode>('deposit')
  const [refreshKey, setRefreshKey]     = useState(0)
  const nowSec = useNowSec()

  const usdcFact    = getUsdc(targetChainId)
  const usdcAddr    = (usdcFact?.address ?? '0x0') as `0x${string}`
  const usdcDec     = usdcFact?.decimals ?? 6
  const isDeployed  = Boolean(savingsAddress)
  const contractAddr = (savingsAddress ?? '0x0')

  // Wallet USDC balance
  const { data: walletBalance } = useReadContract({
    address: usdcAddr, abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(address) && isDeployed, refetchInterval: 10_000 },
  })

  // Total deposited
  const { data: totalDep } = useReadContract({
    address: contractAddr, abi: SAVINGS_ABI, functionName: 'totalDeposited',
    chainId: targetChainId,
    query: { enabled: isDeployed, refetchInterval: 15_000 },
  })

  // Positions for all three plans
  const posQueries = PLANS.map(p =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useReadContract({
      address: contractAddr, abi: SAVINGS_ABI, functionName: 'getPosition',
      args: address ? [address, p.id] : undefined,
      chainId: targetChainId,
      query: { enabled: Boolean(address) && isDeployed, refetchInterval: 12_000 },
    })
  )

  // re-read positions after action
  const refresh = () => setRefreshKey(k => k + 1)
  useEffect(() => { posQueries.forEach(q => { void q.refetch() }) }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = PLANS[selectedPlan]
  const posData = posQueries[selectedPlan].data as [bigint, bigint, bigint, bigint] | undefined
  const [principal, interest, , lockEndsAt] = posData ?? [0n, 0n, 0n, 0n]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="savings-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            key="savings-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={spring}
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '92dvh', overflowY: 'auto' }}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0 sticky top-0 z-10" style={{ background: spectral }} />

            {/* Header */}
            <div className="sticky top-1 z-10 flex items-center justify-between bg-white/95 px-5 py-4 backdrop-blur-sm" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: '#eff6ff' }}>
                  <PiggyBank className="size-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Savings</p>
                  {totalDep != null && (
                    <p className="text-xs text-slate-400">${fmt(totalDep, usdcDec)} total deposited</p>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90">
                <X className="size-4" />
              </button>
            </div>

            <div className="px-4 pb-8 pt-4 space-y-4">
              {!isDeployed ? (
                <div className="rounded-2xl bg-amber-50 p-5 text-center" style={{ border: '1px solid #fde68a' }}>
                  <Info className="mx-auto size-8 text-amber-500" />
                  <p className="mt-2 font-semibold text-amber-700">Contract not yet deployed</p>
                  <p className="mt-1 text-xs text-amber-600">Deploy the OpenPaySavings contract to enable savings features.</p>
                </div>
              ) : !address ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-center" style={{ border: '1px solid var(--border)' }}>
                  <PiggyBank className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">Connect your wallet to start saving</p>
                </div>
              ) : (
                <>
                  {/* APY comparison bar */}
                  <div className="rounded-2xl p-3" style={{ background: 'linear-gradient(135deg,#f0f4ff,#f5f0ff)', border: '1px solid #e0e7ff' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="size-4 text-blue-600" />
                      <span className="text-xs font-bold text-blue-700">Earn up to 8.5% APY on USDC</span>
                    </div>
                    <div className="flex gap-1">
                      {PLANS.map(p => (
                        <div key={p.id} className="flex-1 rounded-lg p-2 text-center" style={{ background: p.color }}>
                          <p className="text-[10px] font-semibold" style={{ color: p.text }}>{p.label}</p>
                          <p className="text-xs font-extrabold" style={{ color: p.text }}>{p.apy}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Plan cards */}
                  <div className="space-y-2">
                    {PLANS.map((p, i) => {
                      const pd = posQueries[i].data as [bigint, bigint, bigint, bigint] | undefined
                      const [pri, int_, , lk] = pd ?? [0n, 0n, 0n, 0n]
                      return (
                        <PlanCard
                          key={p.id}
                          plan={p}
                          selected={selectedPlan === p.id}
                          onSelect={() => { setSelectedPlan(p.id); setActionMode('deposit') }}
                          principal={pri}
                          interest={int_}
                          lockEndsAt={lk}
                          usdcDecimals={usdcDec}
                          nowSec={nowSec}
                        />
                      )
                    })}
                  </div>

                  {/* Selected plan action */}
                  <div className="rounded-2xl p-4 bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex size-6 items-center justify-center rounded-lg" style={{ background: plan.color, color: plan.text }}>
                        <ChevronRight className="size-3.5" />
                      </div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{plan.label}</p>
                      <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: plan.color, color: plan.text }}>{plan.apy} APY</span>
                    </div>
                    <ActionPanel
                      plan={plan}
                      mode={actionMode}
                      setMode={setActionMode}
                      savingsAddress={contractAddr}
                      usdcAddress={usdcAddr}
                      usdcDecimals={usdcDec}
                      chainId={targetChainId}
                      principal={principal}
                      interest={interest}
                      lockEndsAt={lockEndsAt}
                      walletBalance={walletBalance ?? 0n}
                      onSuccess={refresh}
                      nowSec={nowSec}
                    />
                  </div>

                  {/* Disclaimer */}
                  <p className="text-center text-[10px] text-slate-300 px-4">
                    Interest is funded by the contract reserve. APY figures are illustrative. Not financial advice.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
