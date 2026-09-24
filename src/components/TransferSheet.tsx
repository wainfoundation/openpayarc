/**
 * TransferSheet — transfer USDC to any address on the active network.
 * Functionally identical to SendSheet but uses the "Transfer" framing
 * (useful for moving between your own wallets).
 * Accepts an optional `prefillTo` so QR-scan can pre-fill the recipient.
 */
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, ExternalLink, ArrowRight, ArrowLeftRight, ChevronLeft, AlertTriangle } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, isAddress, parseUnits } from 'viem'
import { getUsdc, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import { TokenUSDC } from '@web3icons/react'
import { useNetwork } from '@/NetworkContext'
import type { TxRecord } from './ActivityFeed'
import { useNetworkFee } from '@/hooks/useNetworkFee'
import { FEE_WALLET, calcPlatformFee, formatFee } from '@/hooks/usePlatformFee'

const springs = { sheet: { type: 'spring', damping: 32, stiffness: 300 } }

function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (error as { code?: number })?.code === 4001) return 'Cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance.'
  if (msg.includes('reverted')) return 'Transaction failed. Please try again.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}

interface Props {
  open: boolean
  onClose: () => void
  prefillTo?: string
  onTxSent?: (tx: TxRecord) => void
}

export default function TransferSheet({ open, onClose, prefillTo, onTxSent }: Props) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
  const { feeUSDC, isLoading: feeLoading } = useNetworkFee()
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const usdcFact = getUsdc(targetChainId)
  const USDC_ADDRESS = (usdcFact?.address ?? '0x0') as `0x${string}`

  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(address) && Boolean(usdcFact) },
  })

  const formattedBalance = rawBalance != null
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(targetChainId)).toFixed(2)
    : null

  const [phase, setPhase] = useState<'form' | 'review' | 'sending'>('form')
  const [recipient, setRecipient] = useState(prefillTo ?? '')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')

  const decimals = usdcDecimalsFor(targetChainId)
  const platformFee = calcPlatformFee(amount)
  const platformFeeDisplay = formatFee(amount)

  // Sync prefillTo when it changes
  useEffect(() => {
    if (prefillTo) setRecipient(prefillTo)
  }, [prefillTo])

  const isWrongChain = chainId !== targetChainId
  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0

  // Fee tx (step 1)
  const { writeContract: writeFee, data: feeHash, isPending: feePending, isError: feeError, error: feeErr, reset: resetFee } = useWriteContract()
  const { isLoading: feeConfirming, isSuccess: feeSuccess } = useWaitForTransactionReceipt({ hash: feeHash })

  // Main tx (step 2)
  const { writeContract: writeMain, data: mainHash, isPending: mainPending, isError: mainError, error: mainErr, reset: resetMain } = useWriteContract()
  const { isLoading: mainConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: mainHash })

  const isPending = feePending || mainPending
  const isConfirming = feeConfirming || mainConfirming
  const isError = feeError || mainError
  const error = feeErr ?? mainErr
  const txUrl = mainHash ? buildTxExplorerUrl(targetChainId, mainHash) : null
  const explorerName = requireChain(targetChainId).explorerBase.includes('testnet') ? 'ArcScan Testnet' : 'ArcScan'

  // After fee confirmed → send main transfer
  useEffect(() => {
    if (feeSuccess) {
      let parsed: Amount
      try { parsed = parseAmount(targetChainId, amount) } catch { return }
      writeMain({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [recipient as `0x${string}`, parsed.raw], chainId: targetChainId })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeSuccess])

  // Fire callback once main confirmed
  useEffect(() => {
    if (isSuccess && mainHash && onTxSent) {
      onTxSent({ hash: mainHash, direction: 'sent', amount: parseFloat(amount).toFixed(2), counterparty: recipient, timestamp: Date.now(), memo })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const handleClose = () => {
    if (!isPending && !isConfirming) {
      setRecipient(''); setAmount(''); setMemo(''); setPhase('form'); resetFee(); resetMain(); onClose()
    }
  }

  const handleReview = () => {
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    setPhase('review')
  }

  const handleConfirm = () => {
    setPhase('sending')
    const feeRaw = parseUnits(platformFee.toFixed(6), decimals)
    writeFee({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [FEE_WALLET, feeRaw], chainId: targetChainId })
  }



  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: '#eff6ff' }}>
                    <ArrowLeftRight className="size-4" style={{ color: '#2563eb' }} />
                  </div>
                  <div>
                    <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>Transfer</h2>
                    <p className="text-xs text-slate-400">{chainName}</p>
                  </div>
                </div>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {isSuccess ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-green-50 p-5 text-center">
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100">
                      <svg className="size-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="font-bold" style={{ color: 'var(--ink)' }}>Transferred {amount} USDC</p>
                    <p className="mt-1 text-xs text-slate-400">Confirmed on {chainName}</p>
                    {txUrl && (
                      <a href={txUrl} target="_blank" rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                        View on {explorerName} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <button onClick={handleClose}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                    style={{ background: 'var(--accent)' }}>
                    Done
                  </button>
                </div>
              ) : phase === 'review' ? (
                /* ── Review ── */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <button onClick={() => setPhase('form')} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                      <ChevronLeft className="size-4" />
                    </button>
                    <p className="font-semibold text-slate-700">Review Transfer</p>
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {[
                      { label: 'To',           value: `${recipient.slice(0,10)}…${recipient.slice(-8)}`, mono: true },
                      { label: 'Amount',        value: `${amount} USDC`, highlight: true },
                      { label: 'Network',       value: chainName },
                      ...(memo ? [{ label: 'Note', value: memo }] : []),
                      { label: 'Platform fee (1%)', value: platformFeeDisplay, subtle: true },
                      { label: 'Network fee',   value: feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC'), subtle: true },
                    ].map((r, i, arr) => (
                      <div key={r.label} className="flex items-center justify-between bg-white px-4 py-3" style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{r.label}</span>
                        <span className={`text-sm font-semibold ${'mono' in r && r.mono ? 'font-mono text-xs' : ''}`}
                          style={{ color: 'highlight' in r && r.highlight ? '#2563eb' : 'subtle' in r && r.subtle ? 'var(--muted)' : 'var(--ink)' }}>
                          {r.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!isTestnet && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                      <AlertTriangle className="size-4 shrink-0 text-red-500" />
                      <p className="text-xs font-semibold text-red-600">Mainnet — real USDC. This cannot be reversed.</p>
                    </div>
                  )}
                  {isError && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">{parseOnchainError(error)}</p>}
                  <button onClick={handleConfirm} disabled={isPending || isConfirming}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    {feePending
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm fee in wallet…</span>
                      : feeConfirming
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Processing fee…</span>
                      : mainPending
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm transfer in wallet…</span>
                      : mainConfirming
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirming…</span>
                      : <span className="flex items-center justify-center gap-1.5">Confirm Transfer <ArrowRight className="size-4" /></span>
                    }
                  </button>
                  <button onClick={() => setPhase('form')} className="w-full rounded-2xl py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Recipient */}
                  <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">To address</label>
                    <input
                      value={recipient}
                      onChange={e => setRecipient(e.target.value.trim())}
                      placeholder="0x..."
                      className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                      style={{ color: 'var(--ink)' }}
                    />
                    {recipient && !recipientValid && (
                      <p className="mt-1 text-xs text-red-500">Invalid address</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        placeholder="0.00"
                        className="display min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-200"
                        style={{ color: 'var(--ink)' }}
                      />
                      <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-1.5" style={{ border: '1px solid var(--border)' }}>
                        <TokenUSDC variant="branded" size={18} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>USDC</span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <span className="text-xs text-slate-400">{chainName}</span>
                      {formattedBalance != null && (
                        <button onClick={() => setAmount(formattedBalance)}
                          className="text-xs font-semibold" style={{ color: '#2563eb' }}>
                          Balance: {formattedBalance} · Max
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Memo */}
                  <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Note (optional)</label>
                    <input
                      value={memo}
                      onChange={e => setMemo(e.target.value)}
                      placeholder="What's this for?"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>

                  {isError && (
                    <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
                      {parseOnchainError(error)}
                    </p>
                  )}

                  <button
                    disabled={!recipientValid || !amountValid}
                    onClick={handleReview}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent)' }}
                  >
                    {isWrongChain
                      ? `Switch to ${chainName}`
                      : <span className="flex items-center justify-center gap-1.5">Review <ArrowRight className="size-4" /></span>
                    }
                  </button>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
