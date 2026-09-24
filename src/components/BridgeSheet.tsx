/**
 * BridgeSheet — cross-chain USDC bridge into Arc using Circle App Kit (CCTP).
 * Uses the wagmi connector provider adapter.
 *
 * Supported source chains (testnet mode): ETH Sepolia, Base Sepolia, ARB Sepolia, Polygon Amoy
 * Supported source chains (mainnet mode): Ethereum, Base, Arbitrum, Polygon
 * Destination: always Arc (testnet or mainnet based on admin setting)
 */
import { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowDown, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import type { EIP1193Provider } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { AppKit, BridgeChain } from '@circle-fin/app-kit'
import type { BridgeResult } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { useNetwork } from '@/NetworkContext'
import { useNetworkFee } from '@/hooks/useNetworkFee'

const springs = { sheet: { type: 'spring', damping: 32, stiffness: 300 } }
const appKit = new AppKit()

// ─── Chain config ─────────────────────────────────────────────────────────────

interface SourceChain {
  id: number         // wagmi chainId
  kitChain: BridgeChain
  name: string
  short: string
  bg: string
  color: string
}

const TESTNET_SOURCES: SourceChain[] = [
  { id: 11155111, kitChain: BridgeChain.Ethereum_Sepolia, name: 'Ethereum Sepolia', short: 'ETH', bg: '#627EEA22', color: '#627EEA' },
  { id: 84532,    kitChain: BridgeChain.Base_Sepolia,     name: 'Base Sepolia',     short: 'BASE', bg: '#0052FF22', color: '#0052FF' },
  { id: 421614,   kitChain: BridgeChain.Arbitrum_Sepolia, name: 'Arbitrum Sepolia', short: 'ARB',  bg: '#28A0F022', color: '#28A0F0' },
  { id: 80002,    kitChain: BridgeChain.Polygon_Amoy_Testnet, name: 'Polygon Amoy', short: 'POL',  bg: '#8247E522', color: '#8247E5' },
]

const MAINNET_SOURCES: SourceChain[] = [
  { id: 1,        kitChain: BridgeChain.Ethereum, name: 'Ethereum', short: 'ETH',  bg: '#627EEA22', color: '#627EEA' },
  { id: 8453,     kitChain: BridgeChain.Base,     name: 'Base',     short: 'BASE', bg: '#0052FF22', color: '#0052FF' },
  { id: 42161,    kitChain: BridgeChain.Arbitrum, name: 'Arbitrum', short: 'ARB',  bg: '#28A0F022', color: '#28A0F0' },
  { id: 137,      kitChain: BridgeChain.Polygon,  name: 'Polygon',  short: 'POL',  bg: '#8247E522', color: '#8247E5' },
]

// ─── Step tracker ─────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  'bridge.approve':           'Approving USDC...',
  'bridge.burn':              'Burning on source chain...',
  'bridge.fetchAttestation':  'Fetching attestation...',
  'bridge.mint':              'Minting on Arc...',
}

type BridgeStatus = 'idle' | 'bridging' | 'success' | 'error'

interface StepState { name: string; state: 'pending' | 'active' | 'done' | 'error' }

function ChainBadge({ chain }: { chain: SourceChain }) {
  return (
    <span
      className="flex size-8 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: chain.bg, color: chain.color, border: `1px solid ${chain.color}44` }}
    >
      {chain.short.slice(0, 3)}
    </span>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function BridgeSheet({ open, onClose }: Props) {
  const { chainName, isTestnet } = useNetwork()
  const { feeUSDC, isLoading: feeLoading } = useNetworkFee()
  const { address, connector, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const sources = isTestnet ? TESTNET_SOURCES : MAINNET_SOURCES
  const destChain = isTestnet ? BridgeChain.Arc_Testnet : BridgeChain.Arc

  const [source, setSource] = useState<SourceChain>(sources[0])
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [steps, setSteps] = useState<StepState[]>([])
  const [currentStepLabel, setCurrentStepLabel] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [result, setResult] = useState<BridgeResult | null>(null)

  const resultRef = useRef<BridgeResult | null>(null)

  const amountNum = parseFloat(amount)
  const amountValid = !isNaN(amountNum) && amountNum > 0
  const canBridge = isConnected && amountValid && status === 'idle'

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

    // Subscribe to step events
    const stepNames = ['bridge.approve', 'bridge.burn', 'bridge.fetchAttestation', 'bridge.mint'] as const
    type StepEvent = typeof stepNames[number]
    const handlers: Array<[StepEvent, () => void]> = stepNames.map(n => {
      const h = () => {
        updateStep(n, 'active')
        setCurrentStepLabel(STEP_LABELS[n] ?? n)
      }
      appKit.on(n, h)
      return [n, h]
    })

    try {
      // Switch wallet to source chain
      await switchChainAsync({ chainId: source.id })

      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })

      const res = await appKit.bridge({
        from: { adapter, chain: source.kitChain },
        to:   { adapter, chain: destChain },
        amount: amountNum.toFixed(6),
      })

      // Mark all steps done
      stepNames.forEach(n => updateStep(n, 'done'))
      resultRef.current = res
      setResult(res)
      setStatus('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bridge failed. Please try again.'
      setErrMsg(msg)
      setStatus('error')
      steps.forEach(s => { if (s.state === 'active') updateStep(s.name, 'error') })
    } finally {
      handlers.forEach(([n, h]) => appKit.off(n, h))
      setCurrentStepLabel('')
    }
  }

  const handleClose = () => {
    if (status === 'bridging') return // prevent close while in flight
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
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            {/* Spectral strip */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Bridge to Arc</h2>
                  <p className="text-xs text-slate-400">Transfer USDC from another chain to {chainName}</p>
                </div>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100"
                  style={{ opacity: status === 'bridging' ? 0.4 : 1 }}>
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {status === 'success' ? (
                /* ── Success state ── */
                <div className="space-y-4 text-center">
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
                      <CheckCircle2 className="size-9 text-green-600" />
                    </div>
                    <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Bridge complete!</p>
                    <p className="text-sm text-slate-400">
                      ${amount} USDC has arrived on {chainName}
                    </p>
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 underline">
                        <ExternalLink className="size-3.5" />
                        View on explorer
                      </a>
                    )}
                    {txHash && (
                      <p className="mono text-xs text-slate-300">
                        {txHash.slice(0, 18)}...{txHash.slice(-6)}
                      </p>
                    )}
                  </div>
                  <button onClick={handleClose}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                    style={{ background: 'var(--accent)' }}>
                    Done
                  </button>
                </div>

              ) : status === 'bridging' ? (
                /* ── In-progress state ── */
                <div className="space-y-5 py-2">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="size-7 animate-spin text-blue-600" />
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {currentStepLabel || 'Starting bridge...'}
                    </p>
                  </div>

                  {/* Step progress */}
                  <div className="space-y-2">
                    {['bridge.approve', 'bridge.burn', 'bridge.fetchAttestation', 'bridge.mint'].map(sn => {
                      const st = steps.find(s => s.name === sn)
                      const state = st?.state ?? 'pending'
                      return (
                        <div key={sn} className="flex items-center gap-3 rounded-xl px-4 py-3"
                          style={{ background: state === 'active' ? '#eff6ff' : state === 'done' ? '#f0fdf4' : '#f8fafc' }}>
                          <span className="flex size-6 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              background: state === 'done' ? '#16a34a' : state === 'active' ? '#2563eb' : '#e2e8f0',
                              color: state === 'pending' ? '#94a3b8' : 'white',
                            }}>
                            {state === 'done' ? '✓' : state === 'active' ? <Loader2 className="size-3 animate-spin" /> : '·'}
                          </span>
                          <span className="text-sm font-medium" style={{
                            color: state === 'done' ? '#16a34a' : state === 'active' ? '#2563eb' : '#94a3b8',
                          }}>
                            {STEP_LABELS[sn] ?? sn}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="rounded-2xl bg-amber-50 px-4 py-3" style={{ border: '1px solid #fef3c7' }}>
                    <p className="text-xs text-amber-700 text-center">Do not close this window — bridge is in progress.</p>
                  </div>
                </div>

              ) : (
                /* ── Input state ── */
                <div className="space-y-4">
                  {/* Source chain selector */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">From</p>
                    <div className="grid grid-cols-2 gap-2">
                      {sources.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSource(s)}
                          className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-all"
                          style={{
                            background: source.id === s.id ? s.bg : 'var(--surface-muted)',
                            border: `2px solid ${source.id === s.id ? s.color : 'transparent'}`,
                          }}
                        >
                          <ChainBadge chain={s} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center justify-center">
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-100">
                      <ArrowDown className="size-4 text-slate-400" />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3"
                    style={{ border: '2px solid #bfdbfe' }}>
                    <div className="flex size-8 items-center justify-center rounded-full bg-white">
                      <TokenUSDC variant="branded" size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Arc {isTestnet ? 'Testnet' : ''}</p>
                      <p className="text-xs text-blue-600">Destination</p>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="rounded-2xl bg-slate-50 p-4" style={{ border: '1px solid var(--border)' }}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Amount (USDC)</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-slate-400">$</span>
                      <input
                        inputMode="decimal"
                        value={amount}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, '')
                          if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                        }}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-slate-200"
                        style={{ color: 'var(--ink)' }}
                      />
                      <span className="text-sm font-semibold text-slate-400">USDC</span>
                    </div>
                  </div>

                  {/* Not connected warning */}
                  {!isConnected && (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                      <p className="text-xs text-amber-700">Connect your wallet to bridge.</p>
                    </div>
                  )}

                  {/* Error */}
                  {status === 'error' && errMsg && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-red-500" />
                      <p className="text-xs text-red-600">{errMsg}</p>
                    </div>
                  )}

                  {/* Mainnet warning */}
                  {!isTestnet && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
                      <AlertTriangle className="size-4 shrink-0 text-red-500" />
                      <p className="text-xs text-red-600">Mainnet active — this bridge will use real USDC. Transactions are irreversible.</p>
                    </div>
                  )}

                  {/* Bridge button */}
                  <button
                    disabled={!canBridge}
                    onClick={() => { void handleBridge() }}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--accent)' }}
                  >
                    {!isConnected
                      ? 'Connect wallet to bridge'
                      : !amountValid
                      ? 'Enter an amount'
                      : `Bridge $${amount} USDC to Arc`}
                  </button>

                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>Network fee: <span className="font-medium text-slate-500">{feeLoading ? 'Estimating…' : (feeUSDC ?? '~$0.00 USDC')}</span></span>
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
