import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, RefreshCw, Check, ExternalLink, AlertCircle } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId, useReadContract } from 'wagmi'
import { erc20Abi, isAddress, parseUnits, formatUnits } from 'viem'
import { useNetwork } from '@/NetworkContext'
import { getUsdc } from '@/onchain-facts'
import { usdcDecimalsFor } from '@/onchain-money'

// Multicall3 is deployed at the same address on all EVM chains
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const

const MULTICALL3_ABI = [{
  name: 'aggregate3',
  type: 'function',
  stateMutability: 'payable',
  inputs: [{ name: 'calls', type: 'tuple[]', components: [
    { name: 'target', type: 'address' },
    { name: 'allowFailure', type: 'bool' },
    { name: 'callData', type: 'bytes' },
  ]}],
  outputs: [{ name: 'returnData', type: 'tuple[]', components: [
    { name: 'success', type: 'bool' },
    { name: 'returnData', type: 'bytes' },
  ]}],
}] as const

interface Recipient { to: string; amount: string }
interface Props { open: boolean; onClose: () => void }

function BatchSendInner({ onClose }: { onClose: () => void }) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const [recipients, setRecipients] = useState<Recipient[]>([{ to: '', amount: '' }, { to: '', amount: '' }])

  const usdcFact = getUsdc(targetChainId)
  const usdcAddress = (usdcFact?.address ?? '0x0') as `0x${string}`
  const decimals = usdcDecimalsFor(targetChainId)
  const isWrongChain = walletChainId !== targetChainId
  const explorerBase = isTestnet ? 'https://explorer.testnet.arc.io' : 'https://explorer.arc.io'

  const { data: balanceRaw } = useReadContract({
    address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [address!],
    query: { enabled: !!address }
  })
  const balance = balanceRaw ? Number(formatUnits(balanceRaw, decimals)) : 0

  const validRecipients = recipients.filter(r => isAddress(r.to) && parseFloat(r.amount) > 0)
  const totalAmount = validRecipients.reduce((sum, r) => sum + parseFloat(r.amount), 0)

  const addRow = () => setRecipients(r => [...r, { to: '', amount: '' }])
  const removeRow = (i: number) => setRecipients(r => r.filter((_, j) => j !== i))
  const updateRow = (i: number, field: keyof Recipient, val: string) =>
    setRecipients(r => r.map((row, j) => j === i ? { ...row, [field]: val } : row))

  const handleBatchSend = () => {
    if (!validRecipients.length) return
    // Encode each transfer call
    const { encodeFunctionData } = require('viem')
    const calls = validRecipients.map(r => ({
      target: usdcAddress,
      allowFailure: false,
      callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [r.to as `0x${string}`, parseUnits(r.amount, decimals)] }),
    }))
    writeContract({ address: MULTICALL3, abi: MULTICALL3_ABI, functionName: 'aggregate3', args: [calls] })
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#F0FDF4' }}>
          <Check className="size-8" style={{ color: '#16a34a' }} />
        </div>
        <p className="text-lg font-bold" style={{ color: '#15803d' }}>Batch sent!</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{validRecipients.length} recipients · ${totalAmount.toFixed(2)} USDC total</p>
        {txHash && (
          <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-sm underline" style={{ color: '#16a34a' }}>
            View on Explorer <ExternalLink className="size-3.5" />
          </a>
        )}
        <button onClick={() => { reset(); setRecipients([{ to: '', amount: '' }, { to: '', amount: '' }]) }}
          className="mt-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: '#1d2f50' }}>
          Send another batch
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {/* Info */}
      <div className="rounded-xl px-3 py-2.5" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
        <p className="text-xs font-semibold" style={{ color: '#1d4ed8' }}>
          Multicall3 batch — all transfers execute in one transaction. Balance: ${balance.toFixed(4)} USDC
        </p>
      </div>

      {isWrongChain && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: '#FFF3CD', border: '1px solid #F59E0B' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
          <button onClick={() => switchChain({ chainId: targetChainId })} className="text-xs font-bold underline" style={{ color: '#92400E' }}>
            Switch to {chainName}
          </button>
        </div>
      )}

      {/* Recipient rows */}
      <div className="flex flex-col gap-2">
        {recipients.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <input value={r.to} onChange={e => updateRow(i, 'to', e.target.value)} placeholder={`Recipient ${i + 1} address`}
                className="w-full rounded-xl px-3 py-2.5 font-mono text-xs outline-none" style={{ background: 'var(--surface-2,#f8fafc)', border: `1.5px solid ${isAddress(r.to) || !r.to ? 'var(--border)' : '#F87171'}`, color: 'var(--ink)' }} />
              <input value={r.amount} onChange={e => updateRow(i, 'amount', e.target.value)} placeholder="Amount (USDC)" type="number" min="0"
                className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={{ background: 'var(--surface-2,#f8fafc)', border: '1.5px solid var(--border)', color: 'var(--ink)' }} />
            </div>
            {recipients.length > 1 && (
              <button onClick={() => removeRow(i)} className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: '#FEF2F2' }}>
                <Trash2 className="size-4" style={{ color: '#EF4444' }} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addRow} className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold" style={{ background: 'var(--surface-2,#f1f5f9)', color: 'var(--muted)', border: '1.5px dashed var(--border)' }}>
        <Plus className="size-4" /> Add recipient
      </button>

      {validRecipients.length > 0 && (
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Summary</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>${totalAmount.toFixed(4)} USDC to {validRecipients.length} recipient{validRecipients.length > 1 ? 's' : ''}</p>
          {totalAmount > balance && <p className="text-xs font-semibold" style={{ color: '#EF4444' }}>Exceeds balance</p>}
        </div>
      )}

      {writeError && (
        <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: '#FEF2F2', color: '#DC2626' }}>
          {writeError.message.includes('User rejected') ? 'Transaction rejected.' : writeError.message.slice(0, 120)}
        </p>
      )}

      <button onClick={handleBatchSend}
        disabled={!validRecipients.length || isPending || isConfirming || isWrongChain || totalAmount > balance}
        className="flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white disabled:opacity-50"
        style={{ background: '#1d2f50' }}>
        {isPending || isConfirming ? <><RefreshCw className="size-4 animate-spin" /> Sending…</> : `Send to ${validRecipients.length} recipient${validRecipients.length !== 1 ? 's' : ''}`}
      </button>
      <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>Powered by Multicall3 · One transaction</p>
    </div>
  )
}

export default function BatchSendSheet({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="relative z-50 w-full max-w-[480px] rounded-t-3xl pb-safe"
            style={{ background: 'var(--surface,white)', maxHeight: '92dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-2 pt-4" style={{ background: 'var(--surface,white)' }}>
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
              <div className="flex items-center gap-3 pt-3">
                <div className="flex size-10 items-center justify-center rounded-full" style={{ background: '#1d2f50' }}>
                  <span className="text-base font-bold text-white">⇉</span>
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>Batch Send</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Send USDC to multiple addresses</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <BatchSendInner key={open ? 'open' : 'closed'} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
