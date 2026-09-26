/**
 * SavingsSheet — full savings UI for OpenPaySavings contract.
 * Three plans: Flexible (4.2% APY), 30-Day Fixed (5.8%), 90-Day Fixed (8.5%)
 *
 * Chain handling: savings contract lives on Arc Testnet (5042002) only.
 * If wallet is on the wrong chain, we show a Switch Network button.
 * writeContract calls do NOT pass chainId — wagmi uses the wallet's current chain.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, PiggyBank, TrendingUp, Lock, Unlock, ArrowDownToLine,
  ArrowUpFromLine, Sparkles, ChevronRight, Loader2, AlertCircle,
  CheckCircle2, ExternalLink, Clock, Info, RefreshCw,
} from 'lucide-react'
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useChainId, useSwitchChain,
} from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useNetworkFee } from '@/hooks/useNetworkFee'
import { FEE_WALLET, calcPlatformFee, formatFee } from '@/hooks/usePlatformFee'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Savings contract addresses per chain (add mainnet when deployed) */
const SAVINGS_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523', // Arc Testnet
  // 5042: '0x...' // Arc Mainnet — add when deployed
}
/** The chain the savings contract is currently deployed on (for chain-switch UX) */
const SAVINGS_CHAIN_ID = 5042002
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`
const USDC_DECIMALS = 6

// ─── Stable timestamp hook ───────────────────────────────────────────────────

function useNowSec(): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 10_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])
  return now
}

// ─── Contract ABI ────────────────────────────────────────────────────────────

const SAVINGS_ABI = [
  { name: 'deposit',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }, { name: 'amount', type: 'uint128' }], outputs: [] },
  { name: 'withdraw',        type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }], outputs: [] },
  { name: 'claimInterest',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'plan', type: 'uint8' }], outputs: [] },
  { name: 'getPosition',     type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }, { name: 'plan', type: 'uint8' }], outputs: [{ name: 'principal', type: 'uint128' }, { name: 'interest', type: 'uint128' }, { name: 'depositedAt', type: 'uint64' }, { name: 'lockEndsAt', type: 'uint64' }] },
  { name: 'pendingInterest', type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }, { name: 'plan', type: 'uint8' }], outputs: [{ type: 'uint128' }] },
  { name: 'totalDeposited',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'reserveBalance',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
] as const

// ─── Plan metadata ────────────────────────────────────────────────────────────

const PLANS = [
  { id: 0, label: 'Flexible',     apy: '4.2%', apyNum: 4.2, lock: 'No lock',   lockDays: 0,  color: '#dcfce7', text: '#16a34a', border: '#bbf7d0', icon: <Unlock className="size-5" /> },
  { id: 1, label: '30-Day Fixed', apy: '5.8%', apyNum: 5.8, lock: '30 days',   lockDays: 30, color: '#dbeafe', text: '#2563eb', border: '#bfdbfe', icon: <Lock className="size-5" /> },
  { id: 2, label: '90-Day Fixed', apy: '8.5%', apyNum: 8.5, lock: '90 days',   lockDays: 90, color: '#f3e8ff', text: '#9333ea', border: '#e9d5ff', icon: <Lock className="size-5" /> },
] as const

type PlanId = 0 | 1 | 2
type ActionMode = 'deposit' | 'withdraw' | 'claim'
type DepositStep = 'idle' | 'fee' | 'approve' | 'deposit' | 'done_deposit' | 'error'
const DEPOSIT_IN_PROGRESS: DepositStep[] = ['fee', 'approve', 'deposit']

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

// ─── Plan card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: (typeof PLANS)[number]
  selected: boolean
  onSelect: () => void
  principal: bigint
  interest: bigint
  lockEndsAt: bigint
  nowSec: bigint
}

function PlanCard({ plan, selected, onSelect, principal, interest, lockEndsAt, nowSec }: PlanCardProps) {
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
          <p className="text-lg font-extrabold tabular-nums" style={{ color: plan.text }}>{plan.apy}</p>
          <p className="text-[10px] text-slate-400">APY</p>
        </div>
      </div>

      {hasPosition && (
        <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.6)' }}>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Deposited</span>
            <span className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>${fmt(principal, USDC_DECIMALS)}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-slate-500">Interest earned</span>
            <span className="font-bold tabular-nums" style={{ color: plan.text }}>+${fmt(interest, USDC_DECIMALS)}</span>
          </div>
          {isLocked && (
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Clock className="size-3" /> {countdown(lockEndsAt)}
            </div>
          )}
          {isMatured && (
            <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="size-3" /> Ready to withdraw
            </div>
          )}
        </div>
      )}
    </button>
  )
}

// ─── Action panel ─────────────────────────────────────────────────────────────

interface ActionPanelProps {
  plan: (typeof PLANS)[number]
  mode: ActionMode
  setMode: (m: ActionMode) => void
  savingsAddress: `0x${string}`
  principal: bigint
  interest: bigint
  lockEndsAt: bigint
  walletBalance: bigint
  onSuccess: () => void
  nowSec: bigint
}

function ActionPanel({
  plan, mode, setMode,
  savingsAddress,
  principal, interest, lockEndsAt,
  walletBalance, onSuccess, nowSec,
}: ActionPanelProps) {
  const [amount, setAmount]         = useState('')
  // depositStep drives rendering; stepRef drives the step machine (avoids setState-in-effect)
  const [depositStep, setDepositStep] = useState<DepositStep>('idle')
  const stepRef = useRef<DepositStep>('idle')
  const [txError, setTxError]       = useState<string | null>(null)
  const [lastHash, setLastHash]     = useState<`0x${string}` | undefined>()
  const { feeUSDC, isLoading: feeLoading } = useNetworkFee()

  const isLocked = lockEndsAt > 0n && nowSec < lockEndsAt
  const hasPos   = principal > 0n

  // inProgress: derived outside the narrowed type scope so JSX conditions work
  const inProgress = (DEPOSIT_IN_PROGRESS as string[]).includes(depositStep)

  // Single writeContract hook — we sequence steps manually
  const { writeContract, isPending, reset: resetWrite } = useWriteContract()

  // Wait for whichever tx is in flight
  const { isLoading: confirming, isSuccess: txSuccess, data: receiptHash } = useWaitForTransactionReceipt({ hash: lastHash })

  const busy = isPending || confirming

  const rawAmount  = amount && Number(amount) > 0 ? parseUnits(amount, USDC_DECIMALS) : 0n
  const feeAmount  = amount && Number(amount) > 0 ? parseUnits(calcPlatformFee(amount).toFixed(6), USDC_DECIMALS) : 0n

  function cleanErr(e: Error): string {
    return e.message.split('\n')[0]?.slice(0, 120) ?? 'Transaction failed'
  }

  function onTxError(e: Error) {
    stepRef.current = 'error'
    setTxError(cleanErr(e))
    setDepositStep('error')
    resetWrite()
  }

  // Step machine: advance on each tx confirmation.
  // Uses stepRef (not depositStep state) to avoid setState-in-effect lint.
  useEffect(() => {
    if (!txSuccess || !receiptHash) return
    const cur = stepRef.current
    if (cur === 'fee') {
      stepRef.current = 'approve'
      setDepositStep('approve')
      resetWrite()
      writeContract(
        { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [savingsAddress, rawAmount] },
        { onSuccess: (h) => setLastHash(h), onError: onTxError },
      )
    } else if (cur === 'approve') {
      stepRef.current = 'deposit'
      setDepositStep('deposit')
      resetWrite()
      writeContract(
        { address: savingsAddress, abi: SAVINGS_ABI, functionName: 'deposit', args: [plan.id, BigInt(rawAmount)] },
        { onSuccess: (h) => setLastHash(h), onError: onTxError },
      )
    } else if (cur === 'deposit') {
      stepRef.current = 'done_deposit'
      setDepositStep('done_deposit')
      onSuccess()
    }
  }, [txSuccess, receiptHash]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeposit = useCallback(() => {
    if (!amount || Number(amount) <= 0) return
    setTxError(null)
    if (feeAmount === 0n) {
      stepRef.current = 'approve'
      setDepositStep('approve')
      resetWrite()
      writeContract(
        { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [savingsAddress, rawAmount] },
        { onSuccess: (h) => setLastHash(h), onError: onTxError },
      )
    } else {
      stepRef.current = 'fee'
      setDepositStep('fee')
      resetWrite()
      writeContract(
        { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [FEE_WALLET, feeAmount] },
        { onSuccess: (h) => setLastHash(h), onError: onTxError },
      )
    }
  }, [amount, rawAmount, feeAmount, savingsAddress, writeContract, resetWrite]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWithdraw = useCallback(() => {
    setTxError(null)
    resetWrite()
    writeContract({
      address: savingsAddress,
      abi: SAVINGS_ABI,
      functionName: 'withdraw',
      args: [plan.id],
    }, {
      onSuccess: (h) => { setLastHash(h) },
      onError: (e) => setTxError(cleanErr(e as Error)),
    })
  }, [savingsAddress, plan.id, writeContract, resetWrite]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClaim = useCallback(() => {
    setTxError(null)
    resetWrite()
    writeContract({
      address: savingsAddress,
      abi: SAVINGS_ABI,
      functionName: 'claimInterest',
      args: [plan.id],
    }, {
      onSuccess: (h) => { setLastHash(h) },
      onError: (e) => setTxError(cleanErr(e as Error)),
    })
  }, [savingsAddress, plan.id, writeContract, resetWrite])

  // Success state for withdraw/claim (single-step)
  const singleSuccess = (mode === 'withdraw' || mode === 'claim') && txSuccess && lastHash != null
  if (singleSuccess) {
    onSuccess()
  }

  const activeChainId = useChainId()
  const explorerUrl = lastHash ? buildTxExplorerUrl(SAVINGS_ADDRESSES[activeChainId] ? activeChainId : SAVINGS_CHAIN_ID, lastHash) : null

  // Deposit step label
  const depositStepLabel = () => {
    if (depositStep === 'fee')     return 'Sending fee…'
    if (depositStep === 'approve') return 'Approving USDC…'
    if (depositStep === 'deposit') return 'Depositing…'
    return ''
  }

  if (depositStep === 'done_deposit') {
    return (
      <motion.div key="dep-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-green-50 p-5 text-center" style={{ border: '1px solid #bbf7d0' }}>
        <CheckCircle2 className="mx-auto size-10 text-green-500" />
        <p className="mt-3 font-bold text-green-700">Deposit successful!</p>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1 text-xs text-green-600 hover:underline">
            View on explorer <ExternalLink className="size-3" />
          </a>
        )}
        <button onClick={() => { stepRef.current = 'idle'; setDepositStep('idle'); setAmount(''); setLastHash(undefined) }}
          className="mt-3 rounded-xl px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100">
          Make another deposit
        </button>
      </motion.div>
    )
  }

  if ((mode === 'withdraw' || mode === 'claim') && singleSuccess) {
    return (
      <motion.div key="act-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-green-50 p-5 text-center" style={{ border: '1px solid #bbf7d0' }}>
        <CheckCircle2 className="mx-auto size-10 text-green-500" />
        <p className="mt-3 font-bold text-green-700">{mode === 'withdraw' ? 'Withdrawal complete!' : 'Interest claimed!'}</p>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1 text-xs text-green-600 hover:underline">
            View on explorer <ExternalLink className="size-3" />
          </a>
        )}
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex rounded-xl p-1" style={{ background: '#f1f5f9' }}>
        {(['deposit', ...(hasPos ? ['withdraw'] : []), ...(hasPos && plan.id === 0 ? ['claim'] : [])] as ActionMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setTxError(null) }}
            className="flex-1 rounded-lg py-2 text-xs font-bold capitalize transition-all"
            style={{
              background: mode === m ? 'white' : 'transparent',
              color: mode === m ? plan.text : '#94a3b8',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
            {m}
          </button>
        ))}
      </div>

      {/* ── Deposit ── */}
      {mode === 'deposit' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Amount (USDC)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full rounded-xl border py-3 pl-8 pr-16 text-sm font-bold outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: '#f8faff', ['--tw-ring-color' as string]: plan.border }}
              />
              <button
                onClick={() => setAmount(fmt(walletBalance, USDC_DECIMALS))}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold"
                style={{ background: plan.color, color: plan.text }}>Max
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Wallet balance: ${fmt(walletBalance, USDC_DECIMALS)} USDC</p>
          </div>

          {amount && Number(amount) > 0 && (
            <div className="rounded-xl p-3 text-xs" style={{ background: plan.color }}>
              <p className="font-semibold" style={{ color: plan.text }}>
                Estimated annual yield: ${(Number(amount) * plan.apyNum / 100).toFixed(2)} USDC
              </p>
              {plan.lockDays > 0 && <p className="mt-0.5 opacity-75" style={{ color: plan.text }}>Locked for {plan.lockDays} days after deposit</p>}
            </div>
          )}

          {/* Deposit step progress indicator */}
          {inProgress && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2" style={{ border: '1px solid #bfdbfe' }}>
              <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-700">{depositStepLabel()}</p>
                <div className="mt-1 flex gap-1">
                  {(['fee', 'approve', 'deposit'] as DepositStep[]).map((s, i) => (
                    <div key={s} className="flex-1 rounded-full h-1" style={{
                      background: ['fee','approve','deposit'].indexOf(depositStep) >= i ? plan.text : '#e2e8f0'
                    }} />
                  ))}
                </div>
                <p className="mt-0.5 text-[10px] text-blue-500">
                  Step {['fee','approve','deposit'].indexOf(depositStep) + 1} of {feeAmount > 0n ? 3 : 2}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleDeposit}
            disabled={busy || inProgress || !amount || Number(amount) <= 0 || rawAmount > walletBalance}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${plan.text},${plan.text}dd)` }}>
            {busy
              ? <><Loader2 className="size-4 animate-spin" />{depositStepLabel() || 'Processing…'}</>
              : <><ArrowDownToLine className="size-4" />Deposit {amount ? `$${Number(amount).toFixed(2)}` : ''}</>}
          </button>

          <p className="text-center text-xs text-slate-400">
            Platform fee (1%): <span className="font-medium text-slate-500">{formatFee(amount)}</span>
            {' · '}Network fee: <span className="font-medium text-slate-500">{feeLoading ? '…' : (feeUSDC ?? '~$0.00')}</span>
          </p>
        </div>
      )}

      {/* ── Withdraw ── */}
      {mode === 'withdraw' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: plan.color, border: `1px solid ${plan.border}` }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: plan.text }}>Principal</span>
              <span className="font-bold" style={{ color: plan.text }}>${fmt(principal, USDC_DECIMALS)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span style={{ color: plan.text }}>+ Interest</span>
              <span className="font-bold" style={{ color: plan.text }}>+${fmt(interest, USDC_DECIMALS)}</span>
            </div>
            <div className="mt-2 border-t pt-2 flex justify-between text-sm font-extrabold" style={{ borderColor: plan.border, color: plan.text }}>
              <span>Total</span>
              <span>${fmt(principal + interest, USDC_DECIMALS)}</span>
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
          <button onClick={handleWithdraw} disabled={busy || isLocked}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#1d2f50,#2563eb)' }}>
            {busy ? <><Loader2 className="size-4 animate-spin" />Withdrawing…</> : <><ArrowUpFromLine className="size-4" />Withdraw all</>}
          </button>
          <p className="text-center text-xs text-slate-400">
            Network fee: <span className="font-medium text-slate-500">{feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC')}</span>
          </p>
        </div>
      )}

      {/* ── Claim interest ── */}
      {mode === 'claim' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4 text-center" style={{ background: plan.color, border: `1px solid ${plan.border}` }}>
            <p className="text-xs font-semibold" style={{ color: plan.text }}>Claimable interest</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: plan.text }}>+${fmt(interest, USDC_DECIMALS)}</p>
            <p className="text-xs mt-0.5 opacity-70" style={{ color: plan.text }}>USDC</p>
          </div>
          <button onClick={handleClaim} disabled={busy || interest === 0n}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{ background: `linear-gradient(135deg,${plan.text},${plan.text}dd)` }}>
            {busy ? <><Loader2 className="size-4 animate-spin" />Claiming…</> : <><Sparkles className="size-4" />Claim ${fmt(interest, USDC_DECIMALS)} USDC</>}
          </button>
          <p className="text-center text-xs text-slate-400">
            Network fee: <span className="font-medium text-slate-500">{feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC')}</span>
          </p>
        </div>
      )}

      {/* Error banner */}
      {(txError || depositStep === 'error') && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3" style={{ border: '1px solid rgba(220,38,38,0.15)' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-xs text-red-600">{txError ?? 'Transaction failed'}</p>
            {depositStep === 'error' && (
              <button onClick={() => { stepRef.current = 'idle'; setDepositStep('idle'); setTxError(null); resetWrite() }}
                className="mt-1 text-xs font-semibold text-red-500 hover:underline">Try again</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  savingsAddress?: `0x${string}` | null // kept for backwards compat, ignored — address derived from chain
}

export default function SavingsSheet({ open, onClose }: Props) {
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(0)
  const [actionMode, setActionMode]     = useState<ActionMode>('deposit')
  const [_refreshKey, setRefreshKey]    = useState(0)
  const nowSec = useNowSec()

  // Derive savings address from wallet's current chain
  const savingsAddress = address ? (SAVINGS_ADDRESSES[walletChainId] ?? null) : null
  const isDeployed   = Boolean(savingsAddress)
  const contractAddr = (savingsAddress ?? '0x0')
  // Which chain(s) have savings deployed — for the switch button message
  const deployedChainIds = Object.keys(SAVINGS_ADDRESSES).map(Number)
  const nearestSavingsChain = deployedChainIds[0] ?? SAVINGS_CHAIN_ID

  // Chain mismatch: wallet must be on a chain where savings is deployed
  const isWrongChain = Boolean(address) && !SAVINGS_ADDRESSES[walletChainId]

  // Wallet USDC balance (read from wallet's current chain)
  const { data: walletBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && isDeployed && !isWrongChain, refetchInterval: 10_000 },
  })

  // Total deposited
  const { data: totalDep } = useReadContract({
    address: contractAddr, abi: SAVINGS_ABI, functionName: 'totalDeposited',
    query: { enabled: isDeployed, refetchInterval: 15_000 },
  })

  // Positions for all three plans
  const pos0 = useReadContract({ address: contractAddr, abi: SAVINGS_ABI, functionName: 'getPosition', args: address ? [address, 0] : undefined, query: { enabled: Boolean(address) && isDeployed, refetchInterval: 12_000 } })
  const pos1 = useReadContract({ address: contractAddr, abi: SAVINGS_ABI, functionName: 'getPosition', args: address ? [address, 1] : undefined, query: { enabled: Boolean(address) && isDeployed, refetchInterval: 12_000 } })
  const pos2 = useReadContract({ address: contractAddr, abi: SAVINGS_ABI, functionName: 'getPosition', args: address ? [address, 2] : undefined, query: { enabled: Boolean(address) && isDeployed, refetchInterval: 12_000 } })
  const posQueries = [pos0, pos1, pos2]

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
    void pos0.refetch()
    void pos1.refetch()
    void pos2.refetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const plan    = PLANS[selectedPlan]
  const posData = posQueries[selectedPlan].data as [bigint, bigint, bigint, bigint] | undefined
  const [principal, interest, , lockEndsAt] = posData ?? [0n, 0n, 0n, 0n]

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="savings-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div key="savings-sheet"
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
                    <p className="text-xs text-slate-400">${fmt(totalDep, USDC_DECIMALS)} total deposited</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={refresh} className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90">
                  <RefreshCw className="size-4" />
                </button>
                <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="px-4 pb-8 pt-4 space-y-4">
              {!isDeployed ? (
                <div className="rounded-2xl bg-amber-50 p-5 text-center" style={{ border: '1px solid #fde68a' }}>
                  <Info className="mx-auto size-8 text-amber-500" />
                  <p className="mt-2 font-semibold text-amber-700">Contract not yet deployed</p>
                  <p className="mt-1 text-xs text-amber-600">Deploy the OpenPaySavings contract to enable savings.</p>
                </div>
              ) : !address ? (
                <div className="rounded-2xl bg-slate-50 p-5 text-center" style={{ border: '1px solid var(--border)' }}>
                  <PiggyBank className="mx-auto size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-500">Connect your wallet to start saving</p>
                </div>
              ) : isWrongChain ? (
                /* ── Wrong chain banner ── */
                <div className="rounded-2xl bg-amber-50 p-5 text-center" style={{ border: '1px solid #fde68a' }}>
                  <AlertCircle className="mx-auto size-8 text-amber-500" />
                  <p className="mt-2 font-semibold text-amber-700">
                    Switch to {nearestSavingsChain === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'}
                  </p>
                  <p className="mt-1 text-xs text-amber-600">
                    The Savings contract is deployed on {nearestSavingsChain === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'} (chain {nearestSavingsChain}).<br />
                    Your wallet is currently on chain {walletChainId}.
                  </p>
                  <button
                    onClick={() => switchChain({ chainId: nearestSavingsChain })}
                    disabled={switching}
                    className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#d97706,#b45309)' }}
                  >
                    {switching
                      ? <><Loader2 className="size-4 animate-spin" />Switching…</>
                      : `Switch to ${nearestSavingsChain === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'}`}
                  </button>
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
                          key={p.id} plan={p}
                          selected={selectedPlan === p.id}
                          onSelect={() => { setSelectedPlan(p.id); setActionMode('deposit') }}
                          principal={pri} interest={int_} lockEndsAt={lk} nowSec={nowSec}
                        />
                      )
                    })}
                  </div>

                  {/* Action panel */}
                  <div className="rounded-2xl p-4 bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex size-6 items-center justify-center rounded-lg" style={{ background: plan.color, color: plan.text }}>
                        <ChevronRight className="size-3.5" />
                      </div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{plan.label}</p>
                      <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: plan.color, color: plan.text }}>{plan.apy} APY</span>
                    </div>
                    <ActionPanel
                      plan={plan} mode={actionMode} setMode={setActionMode}
                      savingsAddress={contractAddr}
                      principal={principal} interest={interest} lockEndsAt={lockEndsAt}
                      walletBalance={walletBalance ?? 0n}
                      onSuccess={refresh} nowSec={nowSec}
                    />
                  </div>

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
