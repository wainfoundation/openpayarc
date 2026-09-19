/**
 * TransferSheet — transfer USDC to any address on the active network.
 * Functionally identical to SendSheet but uses the "Transfer" framing
 * (useful for moving between your own wallets).
 * Accepts an optional `prefillTo` so QR-scan can pre-fill the recipient.
 */
import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, ExternalLink, ArrowRight, ArrowLeftRight } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { getUsdc, buildTxExplorerUrl, requireChain } from '@/onchain-facts'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import { TokenUSDC } from '@web3icons/react'
import { useNetwork } from '@/NetworkContext'
import type { TxRecord } from './ActivityFeed'

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
  const { chainId: targetChainId, chainName } = useNetwork()
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

  // Sync prefillTo when it changes
  useEffect(() => {
    if (prefillTo) setRecipient(prefillTo)
  }, [prefillTo])

  const isWrongChain = chainId !== targetChainId
  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const txUrl = hash ? buildTxExplorerUrl(targetChainId, hash) : null
  const explorerName = requireChain(targetChainId).explorerBase.includes('testnet') ? 'ArcScan Testnet' : 'ArcScan'

  // Fire callback once confirmed
  useEffect(() => {
    if (isSuccess && hash && onTxSent) {
      onTxSent({
        hash,
        direction: 'sent',
        amount: parseFloat(amount).toFixed(2),
        counterparty: recipient,
        timestamp: Date.now(),
        memo,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const handleClose = () => {
    if (!isPending && !isConfirming) {
      setRecipient('')
      setAmount('')
      setMemo('')
      reset()
      onClose()
    }
  }

  const handleSend = () => {
    if (isWrongChain) { switchChain({ chainId: targetChainId }); return }
    let parsed: Amount
    try { parsed = parseAmount(targetChainId, amount) } catch { return }
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parsed.raw],
      chainId: targetChainId,
    })
  }

  const ready = recipientValid && amountValid && !isPending && !isConfirming && !isSuccess

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
                    disabled={!ready || (!isWrongChain && (!recipientValid || !amountValid))}
                    onClick={handleSend}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent)' }}
                  >
                    {isPending
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</span>
                      : isConfirming
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Confirming...</span>
                      : isWrongChain
                      ? `Switch to ${chainName}`
                      : <span className="flex items-center justify-center gap-1.5">Transfer <ArrowRight className="size-4" /></span>
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
