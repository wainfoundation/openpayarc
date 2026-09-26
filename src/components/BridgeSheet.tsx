/**
 * BridgeSheet — cross-chain USDC bridge into Arc using Circle App Kit (CCTP).
 *
 * Testnet sources: ETH Sepolia, Base Sepolia, ARB Sepolia, Polygon Amoy
 * Mainnet sources: Ethereum, Base, Arbitrum, Polygon
 * Destination: always Arc (testnet or mainnet per admin setting)
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowDown, Loader2, CheckCircle2, AlertTriangle, ExternalLink, ChevronRight } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { AppKit, BridgeChain } from '@circle-fin/app-kit'
import type { BridgeResult } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { useNetwork } from '@/NetworkContext'
import { useNetworkFee } from '@/hooks/useNetworkFee'

const appKit = new AppKit()

// ─── Chain config ──────────────────────────────────────────────────────────────

interface SourceChain {
  id: number
  kitChain: BridgeChain
  name: string
  short: string
  color: string
  bg: string
  logo: string   // emoji or short text used as visual identifier
}

const TESTNET_SOURCES: SourceChain[] = [
  { id: 11155111, kitChain: BridgeChain.Ethereum_Sepolia, name: 'Ethereum Sepolia', short: 'ETH',  color: '#627EEA', bg: '#627EEA15', logo: 'Ξ' },
  { id: 84532,    kitChain: BridgeChain.Base_Sepolia,     name: 'Base Sepolia',     short: 'BASE', color: '#0052FF', bg: '#0052FF15', logo: '⬡' },
  { id: 421614,   kitChain: BridgeChain.Arbitrum_Sepolia, name: 'Arbitrum Sepolia', short: 'ARB',  color: '#28A0F0', bg: '#28A0F015', logo: '◈' },
  { id: 80002,    kitChain: BridgeChain.Polygon_Amoy_Testnet, name: 'Polygon Amoy', short: 'POL', color: '#8247E5', bg: '#8247E515', logo: '⬟' },
]

const MAINNET_SOURCES: SourceChain[] = [
  { id: 1,     kitChain: BridgeChain.Ethereum, name: 'Ethereum', short: 'ETH',  color: '#627EEA', bg: '#627EEA15', logo: 'Ξ' },
  { id: 8453,  kitChain: BridgeChain.Base,     name: 'Base',     short: 'BASE', color: '#0052FF', bg: '#0052FF15', logo: '⬡' },
  { id: 42161, kitChain: BridgeChain.Arbitrum, name: 'Arbitrum', short: 'ARB',  color: '#28A0F0', bg: '#28A0F015', logo: '◈' },
  { id: 137,   kitChain: BridgeChain.Polygon,  name: 'Polygon',  short: 'POL',  color: '#8247E5', bg: '#8247E515', logo: '⬟' },
]

const STEP_LABELS: Record<string, string> = {
  'bridge.approve':          'Approving USDC',
  'bridge.burn':             'Burning on source chain',
  'bridge.fetchAttestation': 'Fetching attestation',
  'bridge.mint':             'Minting on Arc',
}
const STEP_NAMES = ['bridge.approve', 'bridge.burn', 'bridge.fetchAttestation', 'bridge.mint'] as const

type StepName = typeof STEP_NAMES[number]
type BridgeStatus = 'idle' | 'bridging' | 'success' | 'error'
interface StepState { name: string; state: 'pending' | 'active' | 'done' | 'error' }

// ─── Chain button ──────────────────────────────────────────────────────────────

function ChainButton({
  chain, selected, onClick,
}: { chain: SourceChain; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all active:scale-[0.98]"
      style={{
        background: selected ? chain.bg : 'var(--surface-muted, #f8fafc)',
        border: `2px solid ${selected ? chain.color : 'transparent'}`,
        boxShadow: selected ? `0 0 0 1px ${chain.color}22` : undefined,
      }}
    >
      {/* Chain icon circle */}
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ background: chain.bg, color: chain.color, border: `1.5px solid ${chain.color}44` }}
      >
        {chain.logo}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>{chain.name}</p>
        <p className="text-[11px] font-medium" style={{ color: chain.color }}>{chain.short}</p>
      </div>
      {selected && <ChevronRight className="size-4 shrink-0" style={{ color: chain.color }} />}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void }

export default function BridgeSheet({ open, onClose }: Props) {
  const { chainName, isTestnet } = useNetwork()
  const { feeUSDC, isLoading: feeLoading } = useNetworkFee()
  const { address, connector, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const sources = isTestnet ? TESTNET_SOURCES : MAINNET_SOURCES

  const [sourceId, setSourceId] = useState<number>(sources[0].id)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [steps, setSteps] = useState<StepState[]>([])
  const [currentStepLabel, setCurrentStepLabel] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [result, setResult] = useState<BridgeResult | null>(null)

  // Derive selected source — falls back to first if current id isn't in the current network's list
  const source = sources.find(s => s.id === sourceId) ?? sources[0]

  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0
  const canBridge = isConnected && amountValid && status === 'idle'

  const destChain = isTestnet ? BridgeChain.Arc_Testnet : BridgeChain.Arc

  const updateStep = (name: string, state: StepState['state']) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.name === name)
      if (idx === -1) return [...prev, { name, state }]
      return prev.map((s, i) => i === idx ? { ...s, state } : s)
    })
  }

  const handleBridge = async () => {
    if (!canBridge || !connector || !address) return
    setStatus('bridging')
    setSteps([])
    setErrMsg('')

    const handlers: Array<[StepName, () => void]> = STEP_NAMES.map(n => {
      const h = () => {
        updateStep(n, 'active')
        setCurrentStepLabel(STEP_LABELS[n] ?? n)
      }
      appKit.on(n, h)
      return [n, h]
    })

    try {
      await switchChainAsync({ chainId: source.id })
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })
      const res = await appKit.bridge({
        from: { adapter, chain: source.kitChain },
        to:   { adapter, chain: destChain },
        amount: amountNum.toFixed(6),
      })
      STEP_NAMES.forEach(n => updateStep(n, 'done'))
      setResult(res)
      setStatus('success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bridge failed. Please try again.'
      setErrMsg(msg.replace(/Details:.*$/s, '').trim())
      setStatus('error')
      setSteps(prev => prev.map(s => s.state === 'active' ? { ...s, state: 'error' as const } : s))
    } finally {
      handlers.forEach(([n, h]) => appKit.off(n, h))
      setCurrentStepLabel('')
    }
  }

  const handleClose = () => {
    if (status === 'bridging') return
    setStatus('idle')
    setSteps([])
    setErrMsg('')
    setResult(null)
    setAmount('')
    onClose()
  }

  const txHash = result?.steps?.find(s => s.name === 'mint')?.txHash
    ?? result?.steps?.find(s => s.name === 'burn')?.txHash
  const explorerUrl = result?.steps?.find(s => s.name === 'mint')?.explorerUrl
    ?? result?.steps?.find(s => s.name === 'burn')?.explorerUrl

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md rounded-t-3xl overflow-hidden"
            style={{ background: 'var(--surface, white)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 pt-1 pb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Bridge to Arc</h2>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Transfer USDC from another chain to {chainName}</p>
              </div>
              <button
                onClick={handleClose}
                disabled={status === 'bridging'}
                className="flex size-8 items-center justify-center rounded-full transition disabled:opacity-40"
                style={{ background: 'var(--surface-muted, #f1f5f9)' }}
              >
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">

              {/* ── Success ── */}
              {status === 'success' && (
                <div className="space-y-4 text-center py-4">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                      <CheckCircle2 className="size-9 text-green-600" />
                    </div>
                    <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Bridge complete!</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>${amount} USDC has arrived on {chainName}</p>
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 underline">
                        <ExternalLink className="size-3.5" /> View on explorer
                      </a>
                    )}
                    {txHash && (
                      <p className="font-mono text-xs text-slate-300">{txHash.slice(0, 18)}…{txHash.slice(-6)}</p>
                    )}
                  </div>
                  <button onClick={handleClose}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                    style={{ background: 'var(--accent, #1d2f50)' }}>
                    Done
                  </button>
                </div>
              )}

              {/* ── Bridging ── */}
              {status === 'bridging' && (
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="size-7 animate-spin text-blue-600" />
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {currentStepLabel || 'Starting bridge…'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {STEP_NAMES.map(sn => {
                      const st = steps.find(s => s.name === sn)
                      const state = st?.state ?? 'pending'
                      return (
                        <div key={sn} className="flex items-center gap-3 rounded-xl px-4 py-3"
                          style={{ background: state === 'active' ? '#eff6ff' : state === 'done' ? '#f0fdf4' : state === 'error' ? '#fef2f2' : '#f8fafc' }}>
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: state === 'done' ? '#16a34a' : state === 'active' ? '#2563eb' : state === 'error' ? '#ef4444' : '#e2e8f0',
                              color: state === 'pending' ? '#94a3b8' : 'white',
                            }}>
                            {state === 'done' ? '✓' : state === 'active'
                              ? <Loader2 className="size-3 animate-spin" />
                              : state === 'error' ? '✕' : '·'}
                          </span>
                          <span className="text-sm font-medium" style={{
                            color: state === 'done' ? '#16a34a' : state === 'active' ? '#2563eb' : state === 'error' ? '#ef4444' : '#94a3b8',
                          }}>
                            {STEP_LABELS[sn] ?? sn}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="rounded-2xl bg-amber-50 px-4 py-3" style={{ border: '1px solid #fef3c7' }}>
                    <p className="text-center text-xs text-amber-700">Do not close this window — bridge is in progress.</p>
                  </div>
                </div>
              )}

              {/* ── Input ── */}
              {(status === 'idle' || status === 'error') && (
                <div className="space-y-4">

                  {/* Source chain selector */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>From</p>
                    <div className="grid grid-cols-2 gap-2">
                      {sources.map(s => (
                        <ChainButton key={s.id} chain={s} selected={source.id === s.id} onClick={() => setSourceId(s.id)} />
                      ))}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center">
                    <div className="flex size-9 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted, #f1f5f9)' }}>
                      <ArrowDown className="size-4" style={{ color: 'var(--muted)' }} />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{ background: '#eff6ff', border: '2px solid #bfdbfe' }}>
                    <div className="flex size-9 items-center justify-center rounded-full bg-white">
                      <TokenUSDC variant="branded" size={22} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Arc{isTestnet ? ' Testnet' : ''}</p>
                      <p className="text-xs font-medium text-blue-600">Destination · USDC</p>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border, #e2e8f0)' }}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                      Amount (USDC)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold" style={{ color: 'var(--muted)' }}>$</span>
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none"
                        style={{ color: 'var(--ink)', caretColor: 'var(--accent)' }}
                      />
                      <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>USDC</span>
                    </div>
                  </div>

                  {/* Warnings */}
                  {!isConnected && (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                      <p className="text-xs text-amber-700">Connect your wallet to bridge.</p>
                    </div>
                  )}
                  {!isTestnet && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-red-500" />
                      <p className="text-xs text-red-600">Mainnet — real USDC. Transactions are irreversible.</p>
                    </div>
                  )}
                  {status === 'error' && errMsg && (
                    <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-red-500 mt-0.5" />
                      <p className="text-xs text-red-600 break-words">{errMsg}</p>
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    disabled={!canBridge}
                    onClick={() => { void handleBridge() }}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: source.color }}
                  >
                    {!isConnected ? 'Connect wallet to bridge'
                      : !amountValid ? 'Enter an amount'
                      : `Bridge $${amount} USDC → Arc`}
                  </button>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-1 text-xs" style={{ color: 'var(--muted)' }}>
                    <span>Network fee: <span className="font-medium">{feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC')}</span></span>
                    <span>Powered by CCTP · ~20s</span>
                  </div>
                </div>
              )}

            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
