import { useState, useEffect, useRef } from 'react'
import type { TxRecord } from './ActivityFeed'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, ExternalLink, ArrowRight, ChevronLeft, AlertTriangle, ChevronDown, Check } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract, useChainId } from 'wagmi'
import { erc20Abi, isAddress, parseUnits } from 'viem'
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { TokenUSDC } from '@web3icons/react'
import OUSDIcon from './OUSDIcon'
import { useNetwork } from '@/NetworkContext'
import { useNetworkFee } from '@/hooks/useNetworkFee'
import { FEE_WALLET, calcPlatformFee, formatFee } from '@/hooks/usePlatformFee'
import { getArcTokens, type ArcToken } from '@/arcTokens'

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

/** Token icon for any Arc token */
function TokenIcon({ token, size = 18 }: { token: ArcToken; size?: number }) {
  if (token.symbol === 'USDC') return <TokenUSDC variant="branded" size={size} />
  if (token.symbol === 'OUSD') return <OUSDIcon size={size} />
  // Generic circle icon with token color
  const initials: Record<string, string> = { EURC: '€', USYC: '⬡', cirBTC: '₿' }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: token.color, fontSize: size * 0.45 }}
    >
      {initials[token.symbol] ?? token.symbol[0]}
    </div>
  )
}

type Phase = 'form' | 'review' | 'sending' | 'success'

interface Props {
  open: boolean
  onClose: () => void
  prefillTo?: string
  onTxSent?: (tx: TxRecord) => void
}

/** Read a single token balance */
function useTokenBalance(token: ArcToken | undefined, address: `0x${string}` | undefined, chainId: number) {
  const enabled = Boolean(address) && Boolean(token?.address)
  const { data } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled },
  })
  if (!data || !token) return null
  return (Number(data) / 10 ** token.decimals).toFixed(token.decimals === 8 ? 8 : 2)
}

export default function SendSheet({ open, onClose, prefillTo, onTxSent }: Props) {
  const { chainId: targetChainId, chainName, isTestnet, features } = useNetwork()
  const { feeUSDC, isLoading: feeLoading } = useNetworkFee()
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()

  // Build the list of tokens the user can send (filtered by feature flags + availability)
  const allTokens = getArcTokens(targetChainId)
  const sendableTokens = allTokens.filter(t => {
    if (!t.address) return false // not deployed on this chain
    if (t.featureKey && !(features as Record<string, boolean>)[t.featureKey]) return false
    return true
  })

  const [selectedSymbol, setSelectedSymbol] = useState<string>('USDC')
  const [tokenMenuOpen, setTokenMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // If selected token is no longer sendable (feature disabled), fall back to USDC
  const selectedToken = sendableTokens.find(t => t.symbol === selectedSymbol) ?? sendableTokens[0]
  useEffect(() => {
    if (!sendableTokens.find(t => t.symbol === selectedSymbol)) setSelectedSymbol('USDC')
  }, [isTestnet, features, sendableTokens, selectedSymbol])

  const usdcToken = allTokens.find(t => t.symbol === 'USDC')

  const balance = useTokenBalance(selectedToken, address, targetChainId)

  const [recipient, setRecipient] = useState(prefillTo ?? '')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [phase, setPhase] = useState<Phase>('form')

  const isWrongChain = walletChainId !== targetChainId
  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0

  const { writeContract: writeFee, data: feeHash, isPending: feePending, isError: feeError, error: feeErr, reset: resetFee } = useWriteContract()
  const { isLoading: feeConfirming, isSuccess: feeSuccess } = useWaitForTransactionReceipt({ hash: feeHash })
  const { writeContract: writeMain, data: mainHash, isPending: mainPending, isError: mainError, error: mainErr, reset: resetMain } = useWriteContract()
  const { isLoading: mainConfirming, isSuccess: mainSuccess } = useWaitForTransactionReceipt({ hash: mainHash })

  const txUrl = mainHash ? buildTxExplorerUrl(targetChainId, mainHash) : null
  const explorerName = requireChain(targetChainId).explorerBase.includes('testnet') ? 'ArcScan Testnet' : 'ArcScan'

  const platformFee = calcPlatformFee(amount)
  const platformFeeDisplay = formatFee(amount)

  // After fee tx confirmed → send main transfer
  useEffect(() => {
    if (feeSuccess && selectedToken?.address) {
      const raw = BigInt(Math.round(parseFloat(amount) * 10 ** (selectedToken.decimals)))
      writeMain({ address: selectedToken.address, abi: erc20Abi, functionName: 'transfer', args: [recipient as `0x${string}`, raw] })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeSuccess])

  useEffect(() => {
    if (mainSuccess && mainHash && onTxSent) {
      onTxSent({ hash: mainHash, direction: 'sent', amount: parseFloat(amount).toFixed(2), counterparty: recipient, timestamp: Date.now(), memo })
      setPhase('success')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSuccess])

  useEffect(() => {
    if (feePending || feeConfirming || mainPending || mainConfirming) setPhase('sending')
  }, [feePending, feeConfirming, mainPending, mainConfirming])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setTokenMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClose = () => {
    if (!feePending && !feeConfirming && !mainPending && !mainConfirming) {
      setRecipient(''); setAmount(''); setMemo(''); setPhase('form')
      resetFee(); resetMain(); onClose()
    }
  }

  const handleReview = () => {
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    setPhase('review')
  }

  const handleConfirm = () => {
    const feeAmount = parseUnits(platformFee.toFixed(6), 6)
    writeFee({
      address: usdcToken!.address!,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [FEE_WALLET as `0x${string}`, feeAmount],
    })
  }

  const formReady = recipientValid && amountValid
  const isError = feeError || mainError
  const error = feeErr ?? mainErr
  const inProgress = feePending || feeConfirming || mainPending || mainConfirming

  const sendingLabel = feePending ? 'Confirm fee in wallet…'
    : feeConfirming ? 'Processing fee…'
    : mainPending ? 'Confirm transfer in wallet…'
    : 'Confirming transfer…'

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
                    <button onClick={() => setPhase('form')} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <ChevronLeft className="size-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                      {phase === 'review' ? 'Review & Confirm' : phase === 'success' ? '✓ Sent!' : `Send ${selectedToken?.symbol ?? 'Token'}`}
                    </h2>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{chainName}</p>
                  </div>
                </div>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* ── Success ── */}
              {phase === 'success' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5 text-center" style={glass.inner}>
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full" style={{ background: 'rgba(26,128,71,0.1)' }}>
                      <Check className="size-6" style={{ color: 'var(--success)' }} />
                    </div>
                    <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>Sent {amount} {selectedToken?.symbol}</p>
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
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{sendingLabel}</p>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                    <span className={feeSuccess ? 'font-semibold text-green-600' : feePending || feeConfirming ? 'font-semibold text-blue-600' : ''}>{feeSuccess ? '✓' : '1.'} Fee</span>
                    <span>→</span>
                    <span className={mainSuccess ? 'font-semibold text-green-600' : mainPending || mainConfirming ? 'font-semibold text-blue-600' : ''}>{mainSuccess ? '✓' : '2.'} Transfer</span>
                  </div>
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
                      <p className="text-xs font-semibold text-red-600">Mainnet — real {selectedToken?.symbol}. Irreversible.</p>
                    </div>
                  )}
                  <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--border)' }}>
                    <ReviewRow label="To" value={`${recipient.slice(0,10)}...${recipient.slice(-8)}`} mono />
                    <ReviewRow label="Token" value={selectedToken?.name ?? selectedToken?.symbol ?? ''} />
                    <ReviewRow label="Amount" value={`${amount} ${selectedToken?.symbol}`} highlight />
                    <ReviewRow label="Network" value={chainName} />
                    {memo && <ReviewRow label="Memo" value={memo} />}
                    <ReviewRow label="Platform fee (1%)" value={platformFeeDisplay} subtle />
                    <ReviewRow label="Network fee" value={feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC')} subtle />
                  </div>
                  <p className="text-center text-xs text-slate-400">Two transactions: platform fee then transfer.</p>
                  <button onClick={handleConfirm} disabled={inProgress}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    <span className="flex items-center justify-center gap-1.5">Confirm & Send <ArrowRight className="size-4" /></span>
                  </button>
                  <button onClick={() => setPhase('form')} className="w-full rounded-2xl py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancel</button>
                </div>
              )}

              {/* ── Form ── */}
              {phase === 'form' && (
                <div className="space-y-3">
                  {/* Recipient */}
                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>To</label>
                    <input value={recipient} onChange={(e) => setRecipient(e.target.value.trim())}
                      placeholder="0x..." className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-300" style={{ color: 'var(--ink)' }} />
                    {recipient && !recipientValid && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>}
                  </div>

                  {/* Amount + Token selector */}
                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <div className="flex items-center gap-3">
                      <input inputMode="decimal" value={amount}
                        onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v) }}
                        placeholder="0.00"
                        className="display min-w-0 flex-1 bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                        style={{ color: 'var(--ink)' }} />

                      {/* Token selector */}
                      <div className="relative" ref={menuRef}>
                        <button onClick={() => setTokenMenuOpen(o => !o)}
                          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 transition-colors hover:bg-white/80"
                          style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.8)' }}>
                          {selectedToken && <TokenIcon token={selectedToken} size={18} />}
                          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{selectedToken?.symbol}</span>
                          <ChevronDown className="size-3.5 text-slate-400" />
                        </button>
                        {tokenMenuOpen && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl bg-white shadow-lg" style={{ border: '1px solid var(--border)' }}>
                            {sendableTokens.map(t => (
                              <button key={t.symbol} onClick={() => { setSelectedSymbol(t.symbol); setTokenMenuOpen(false); setAmount('') }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
                                style={{ color: t.symbol === selectedSymbol ? 'var(--accent)' : 'var(--ink)' }}>
                                <TokenIcon token={t} size={16} />
                                <div className="flex-1 text-left">
                                  <div>{t.symbol}</div>
                                  <div className="text-xs font-normal text-slate-400">{t.name}</div>
                                </div>
                                {t.symbol === selectedSymbol && <Check className="size-3.5 text-blue-500" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{chainName}</span>
                      {balance != null && (
                        <button onClick={() => setAmount(balance)} className="text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                          Balance: {balance} · Max
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Memo */}
                  <div className="rounded-2xl p-4" style={glass.inner}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Memo (optional)</label>
                    <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What's this for?"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-300" style={{ color: 'var(--ink)' }} />
                  </div>

                  {amountValid && (
                    <p className="text-center text-xs text-slate-400">Platform fee: <span className="font-semibold text-slate-500">{platformFeeDisplay}</span> (1% · min $0.01)</p>
                  )}

                  <button disabled={!formReady} onClick={handleReview}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}>
                    {isWrongChain ? `Switch to ${chainName}` : <span className="flex items-center justify-center gap-1.5">Review <ArrowRight className="size-4" /></span>}
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
      <span className={`text-sm font-semibold ${mono ? 'font-mono text-xs' : ''}`}
        style={{ color: highlight ? '#2563eb' : subtle ? 'var(--muted)' : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}
