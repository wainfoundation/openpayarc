import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Copy, Check, ExternalLink, AlertCircle } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import { useNetwork } from '@/NetworkContext'

// EURC addresses — Arc Testnet: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
const EURC_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  5042:    '0x0000000000000000000000000000000000000000', // TODO: mainnet once confirmed
}
const EURC_DECIMALS = 6

interface Props { open: boolean; onClose: () => void }

function EURCSheetInner({ onClose: _onClose }: { onClose: () => void }) {
  const { chainId: targetChainId, chainName, isTestnet } = useNetwork()
  const { address } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const eurcAddress = EURC_ADDRESSES[targetChainId] ?? '0x0000000000000000000000000000000000000000'
  const isDeployed = eurcAddress !== '0x0000000000000000000000000000000000000000'
  const isWrongChain = walletChainId !== targetChainId

  const [tab, setTab] = useState<'send' | 'info'>('send')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: eurcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address && isDeployed },
  })
  const { data: nameRaw } = useReadContract({ address: eurcAddress, abi: erc20Abi, functionName: 'name', query: { enabled: isDeployed } })
  const { data: symbolRaw } = useReadContract({ address: eurcAddress, abi: erc20Abi, functionName: 'symbol', query: { enabled: isDeployed } })

  const balance = balanceRaw ? Number(formatUnits(balanceRaw, EURC_DECIMALS)) : 0
  const symbol = (symbolRaw as string) ?? 'EURC'
  const name = (nameRaw as string) ?? 'Euro Coin'

  const handleSend = async () => {
    if (!address || !to || !amount) return
    try {
      writeContract({
        address: eurcAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, parseUnits(amount, EURC_DECIMALS)],
      })
    } catch { /* handled by writeError */ }
  }

  const explorerBase = isTestnet ? 'https://explorer.testnet.arc.io' : 'https://explorer.arc.io'

  if (!isDeployed) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#FFF3CD' }}>
          <AlertCircle className="size-7" style={{ color: '#F59E0B' }} />
        </div>
        <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>EURC not yet on {chainName}</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>EURC (Euro Coin) is available on Arc Testnet. Mainnet address will be added when confirmed.</p>
        {!isTestnet && (
          <button onClick={() => switchChain({ chainId: 5042002 })}
            className="mt-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: '#1d2f50' }}>
            Switch to Arc Testnet
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Balance card */}
      <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2563eb)' }}>
        <p className="text-xs font-semibold text-blue-200">EURC Balance</p>
        <p className="mt-1 text-3xl font-bold text-white">€{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">{symbol}</span>
          <span className="text-xs text-blue-200">{chainName}</span>
          <button onClick={() => refetchBalance()} className="ml-auto text-blue-200 hover:text-white"><RefreshCw className="size-3.5" /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-4 mt-4 flex rounded-xl p-1" style={{ background: 'var(--surface-2, #f1f5f9)' }}>
        {(['send', 'info'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-all"
            style={{ background: tab === t ? 'white' : 'transparent', color: tab === t ? 'var(--ink)' : 'var(--muted)', boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            {t === 'send' ? 'Send EURC' : 'About'}
          </button>
        ))}
      </div>

      {tab === 'send' && (
        <div className="flex flex-col gap-3 px-4 pt-4">
          {isWrongChain && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-3" style={{ background: '#FFF3CD', border: '1px solid #F59E0B' }}>
              <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: '#F59E0B' }} />
              <div className="flex-1">
                <p className="text-xs font-bold" style={{ color: '#92400E' }}>Wrong network</p>
                <button onClick={() => switchChain({ chainId: targetChainId })} className="mt-1 text-xs font-bold underline" style={{ color: '#92400E' }}>
                  Switch to {chainName}
                </button>
              </div>
            </div>
          )}
          {isSuccess && (
            <div className="flex flex-col items-center gap-2 rounded-xl py-6 text-center" style={{ background: '#F0FDF4' }}>
              <Check className="size-8" style={{ color: '#16a34a' }} />
              <p className="font-bold" style={{ color: '#15803d' }}>EURC sent!</p>
              {txHash && (
                <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs underline" style={{ color: '#15803d' }}>
                  View on Explorer <ExternalLink className="size-3" />
                </a>
              )}
              <button onClick={() => { reset(); setTo(''); setAmount(''); }} className="mt-1 text-xs font-semibold" style={{ color: '#16a34a' }}>Send again</button>
            </div>
          )}
          {!isSuccess && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>To</label>
                <input value={to} onChange={e => setTo(e.target.value)} placeholder="0x..."
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ background: 'var(--surface-2,#f8fafc)', border: '1.5px solid var(--border)', color: 'var(--ink)' }} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Amount (EURC)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--muted)' }}>€</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0"
                    className="w-full rounded-xl py-3 pl-8 pr-16 text-sm outline-none" style={{ background: 'var(--surface-2,#f8fafc)', border: '1.5px solid var(--border)', color: 'var(--ink)' }} />
                  <button onClick={() => setAmount(balance.toString())} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold" style={{ background: '#EFF6FF', color: '#2563eb' }}>Max</button>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Balance: €{balance.toFixed(4)}</p>
              </div>
              {writeError && (
                <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                  {writeError.message.includes('User rejected') ? 'Transaction rejected.' : writeError.message.slice(0, 120)}
                </p>
              )}
              <button onClick={handleSend} disabled={!to || !amount || isPending || isConfirming || isWrongChain}
                className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: '#1d2f50' }}>
                {isPending || isConfirming ? <><RefreshCw className="size-4 animate-spin" /> Sending…</> : `Send ${amount || '0'} EURC`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'info' && (
        <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{name} ({symbol})</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Euro-pegged stablecoin issued by Circle. 1 EURC = 1 EUR, fully backed by Euro reserves. Available on Arc for Euro-denominated payments.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['Peg', '1 EUR'], ['Decimals', '6'], ['Issuer', 'Circle']].map(([k, v]) => (
              <div key={k} className="flex flex-col items-center rounded-xl p-3" style={{ background: 'var(--surface-2,#f8fafc)' }}>
                <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>{v}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{k}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2,#f8fafc)', border: '1px solid var(--border)' }}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Contract Address</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 truncate font-mono text-xs" style={{ color: 'var(--ink)' }}>{eurcAddress}</p>
              <button onClick={() => { navigator.clipboard.writeText(eurcAddress).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" style={{ color: 'var(--muted)' }} />}
              </button>
              <a href={`${explorerBase}/address/${eurcAddress}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" style={{ color: 'var(--muted)' }} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EURCSheet({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div className="fixed inset-0 bg-black/40 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="relative z-50 w-full max-w-[480px] rounded-t-3xl pb-safe"
            style={{ background: 'var(--surface,white)', maxHeight: '90dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-2 pt-4" style={{ background: 'var(--surface,white)' }}>
              <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-200" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)' }} />
              <div className="flex items-center gap-3 pt-3">
                <div className="flex size-10 items-center justify-center rounded-full" style={{ background: '#1d2f50' }}>
                  <span className="text-base font-bold text-white">€</span>
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: 'var(--ink)' }}>EURC</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Euro Coin on Arc</p>
                </div>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full" style={{ background: 'var(--surface-2,#f1f5f9)' }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <EURCSheetInner key={open ? 'open' : 'closed'} onClose={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
