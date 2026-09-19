import { useState, useEffect } from 'react'
import type { TxRecord } from './ActivityFeed'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, ExternalLink, ArrowRight, ChevronLeft, AlertTriangle } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { getUsdc, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import { TokenUSDC } from '@web3icons/react'
import { useNetwork } from '@/NetworkContext'

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'
const springs = { sheet: { type: 'spring', damping: 32, stiffness: 300 } }
const glass = { inner: { background: 'rgba(255,255,255,0.46)', border: '1px solid rgba(255,255,255,0.56)' } as React.CSSProperties }

function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (message.includes('user rejected') || (error as { code?: number })?.code === 4001) return 'Cancelled.'
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) return 'Insufficient balance.'
  if (message.includes('reverted')) return 'Transaction failed. Please try again.'
  if (message.includes('network') || message.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}

type Phase = 'form' | 'review' | 'sending' | 'success'

interface Props {
  open: boolean
  onClose: () => void
  prefillTo?: string
  onTxSent?: (tx: TxRecord) => void
}

export default function SendSheet({ open, onClose, prefillTo, onTxSent }: Props) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
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

  const [recipient, setRecipient] = useState(prefillTo ?? '')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [phase, setPhase] = useState<Phase>('form')

  const isWrongChain = chainId !== targetChainId
  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const txUrl = hash ? buildTxExplorerUrl(targetChainId, hash) : null
  const explorerName = requireChain(targetChainId).explorerBase.includes('testnet') ? 'ArcScan Testnet' : 'ArcScan'

  useEffect(() => {
    if (isSuccess && hash && onTxSent) {
      onTxSent({ hash, direction: 'sent', amount: parseFloat(amount).toFixed(2), counterparty: recipient, timestamp: Date.now(), memo })
      setPhase('success')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (isPending || isConfirming) setPhase('sending')
  }, [isPending, isConfirming])

  const handleClose = () => {
    if (!isPending && !isConfirming) {
      setRecipient(''); setAmount(''); setMemo(''); setPhase('form'); reset(); onClose()
    }
  }

  const handleReview = () => {
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    setPhase('review')
  }

  const handleConfirm = () => {
    let parsed: Amount
    try { parsed = parseAmount(targetChainId, amount) } catch { return }
    writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer', args: [recipient as `0x${string}`, parsed.raw], chainId: targetChainId })
  }

  const formReady = recipientValid && amountValid

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose}>
          <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
            style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={springs.sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-black/10" /></div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {phase === 'review' && (
                    <button onClick={() => setPhase('form')} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                      <ChevronLeft className="size-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                      {phase === 'review' ? 'Review & Confirm' : phase === 'success' ? 'Sent!' : 'Send USDC'}
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{chainName}</p>
                  </div>
                </div>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full transition-colors" style={{ background: 'var(--surface-muted)' }}>
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* ── Success ── */}
              {phase === 'success' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5 text-center" style={glass.inner}>
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full" style={{ background: 'rgba(26,128,71,0.1)' }}>
                      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--success)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>Sent {amount} USDC</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Confirmed on {chainName}</p>
                    {txUrl && (
                      <a href={txUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                        View on {explorerName} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <button onClick={handleClose} className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Done</button>
                </div>
              )}

              {/* ── Sending ── */}
              {phase === 'sending' && (
                <div className="space-y-4 py-4 text-center">
                  <Loader2 className="mx-auto size-10 animate-spin text-blue-500" />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {isPending ? 'Waiting for wallet confirmation...' : 'Confirming on chain...'}
                  </p>
                  <p className="text-xs text-slate-400">Do not close this window</p>
                  {isError && <p className="rounded-xl px-4 py-2.5 text-xs font-medium" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>{parseOnchainError(error)}</p>}
                  {isError && <button onClick={() => setPhase('review')} className="text-sm font-semibold text-blue-600 underline">Try again</button>}
                </div>
              )}

              {/* ── Review ── */}
              {phase === 'review' && (
                <div className="space-y-4">
                  {!isTestnet && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                      <AlertTriangle className="size-4 shrink-0 text-red-500" />
                      <p className="text-xs font-semibold text-red-600">Mainnet — this uses real USDC. This transaction cannot be reversed.</p>
                    </div>
                  )}
                  <div className="space-y-0 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <ReviewRow label="To" value={`${recipient.slice(0,10)}...${recipient.slice(-8)}`} mono />
                    <ReviewRow label="Amount" value={`${amount} USDC ($${amount})`} highlight />
                    <ReviewRow label="Network" value={chainName} />
                    {memo && <ReviewRow label="Memo" value={memo} />}
                    <ReviewRow label="Fee" value="Gasless (Circle sponsors)" subtle />
                  </div>
                  <button
                    onClick={handleConfirm}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: 'var(--accent)' }}
                  >
                    <span className="flex items-center justify-center gap-1.5">Confirm & Send <ArrowRight className="size-4" /></span>
                  </button>
                  <button onClick={() => setPhase('form')} className="w-full rounded-2xl py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              )}

              {/* ── Form ── */}
              {phase === 'form' && (
                <div className="space-y-3">
                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>To</label>
                    <input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value.trim())}
                      placeholder="0x..."
                      className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                      style={{ color: 'var(--ink)' }}
                    />
                    {recipient && !recipientValid && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>}
                  </div>

                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <div className="flex items-center gap-3">
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        placeholder="0.00"
                        className="display min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                        style={{ color: 'var(--ink)' }}
                      />
                      <div className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.8)' }}>
                        <TokenUSDC variant="branded" size={18} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>USDC</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{chainName}</span>
                      {formattedBalance != null && (
                        <button onClick={() => setAmount(formattedBalance)} className="text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                          Balance: {formattedBalance} · Max
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Memo (optional)</label>
                    <input
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="What's this for?"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>

                  <button
                    disabled={!formReady}
                    onClick={handleReview}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
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

function ReviewRow({ label, value, mono, highlight, subtle }: { label: string; value: string; mono?: boolean; highlight?: boolean; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-white px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span
        className={`text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`}
        style={{ color: highlight ? '#2563eb' : subtle ? 'var(--muted)' : 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}
