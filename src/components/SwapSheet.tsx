/**
 * SwapSheet — token swap powered by Circle App Kit + LiFi aggregator.
 *
 * Design mirrors the Arc Portal swap UI:
 *  - Transfer (from) panel: token selector + amount input + balance
 *  - Arrow swap button to flip the pair
 *  - Receive (to) panel: token selector + estimated output
 *  - Slippage toggle (0.5 / 1.0 / custom)
 *  - Review quote → Swap button
 *  - Progress states: estimating → reviewing → swapping → done / error
 *
 * Rules from swap-tokens skill:
 *  - No kitKey in browser — omitted entirely
 *  - estimateSwap() before swap() — estimate shown, swap only on click
 *  - USDC ↔ NATIVE on Arc is a no-op and rejected before routing
 *  - Chain identifiers are strings ("Arc_Testnet", "Arc"), not chain IDs
 *  - Uses App Kit >= 1.11.0 + adapter-viem-v2 (browser-safe, no polyfills needed)
 *  - Powered by LiFi aggregator (disclosed to user in UI)
 */
import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ArrowUpDown, Settings2, ChevronDown, Loader2,
  AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Info,
} from 'lucide-react'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi, type EIP1193Provider } from 'viem'
import { AppKit, SwapChain, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import { useNetwork } from '@/NetworkContext'
import { getUsdc } from '@/onchain-facts'

// ─── App Kit singleton ────────────────────────────────────────────────────────
const kit = new AppKit()

// ─── Chain / token config ─────────────────────────────────────────────────────

/** Arc chain identifier for the App Kit */
function kitChain(chainId: number): SwapChain {
  if (chainId === 5042) return SwapChain.Arc
  return SwapChain.Arc_Testnet
}

/**
 * Tokens available on Arc. USDC and NATIVE are the same asset on Arc —
 * that pair is rejected before routing. USDT is not deployed on Arc.
 */
const ARC_TOKENS = [
  { symbol: 'USDC', label: 'USDC', color: '#2775CA', emoji: '💵' },
  { symbol: 'EURC', label: 'EURC', color: '#0052B4', emoji: '💶' },
]

type Token = typeof ARC_TOKENS[number]

// EURC contract address on Arc Testnet
const EURC_TESTNET = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'
const EURC_MAINNET = '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c'

function eurcAddress(chainId: number) {
  return chainId === 5042 ? EURC_MAINNET : EURC_TESTNET
}

// ─── Slippage presets ─────────────────────────────────────────────────────────
const SLIPPAGE_PRESETS = [
  { label: '0.5%', bps: 50 },
  { label: '1.0%', bps: 100 },
  { label: '3.0%', bps: 300 },
]

// ─── Types ────────────────────────────────────────────────────────────────────
type SwapPhase =
  | 'idle'
  | 'estimating'
  | 'review'
  | 'swapping'
  | 'success'
  | 'error'

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippageBps: number
  chain: SwapChain
  address: string
}

// ─── Token Selector ───────────────────────────────────────────────────────────
function TokenSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: Token
  onChange: (t: Token) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-xl bg-[#1d2f50] px-3 py-2 text-white transition hover:bg-[#243660] disabled:opacity-50"
      >
        <span className="text-lg leading-none">{value.emoji}</span>
        <span className="font-semibold text-sm">{value.symbol}</span>
        <span className="text-[#3d5d99] text-xs">Arc</span>
        <ChevronDown className="size-3.5 text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full left-0 mt-1 z-50 w-44 rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {ARC_TOKENS.map(t => (
              <button
                key={t.symbol}
                onClick={() => { onChange(t); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl ${t.symbol === value.symbol ? 'bg-blue-50 font-semibold text-[#1d2f50]' : 'text-slate-700'}`}
              >
                <span className="text-base">{t.emoji}</span>
                <div>
                  <p className="font-semibold">{t.symbol}</p>
                  <p className="text-xs text-slate-400">on Arc</p>
                </div>
                {t.symbol === value.symbol && <CheckCircle2 className="ml-auto size-3.5 text-blue-500" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Slippage Panel ───────────────────────────────────────────────────────────
function SlippagePanel({
  bps,
  onChange,
  onClose,
}: {
  bps: number
  onChange: (b: number) => void
  onClose: () => void
}) {
  const [custom, setCustom] = useState('')
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">Slippage Tolerance</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
      </div>
      <div className="flex gap-2 mb-3">
        {SLIPPAGE_PRESETS.map(p => (
          <button
            key={p.bps}
            onClick={() => { onChange(p.bps); setCustom('') }}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${p.bps === bps && !custom ? 'bg-[#1d2f50] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Custom %"
          value={custom}
          onChange={e => {
            setCustom(e.target.value)
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v > 0) onChange(Math.round(v * 100))
          }}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
        <span className="text-sm text-slate-400">%</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Current: {(bps / 100).toFixed(2)}% ({bps} bps). Tighter slippage reduces MEV risk but may cause failures.
      </p>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
interface SwapSheetProps {
  open: boolean
  onClose: () => void
}

export default function SwapSheet({ open, onClose }: SwapSheetProps) {
  const { address, connector, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { chainId, chainName } = useNetwork()

  const [tokenIn,     setTokenIn]     = useState<Token>(ARC_TOKENS[0])  // USDC
  const [tokenOut,    setTokenOut]    = useState<Token>(ARC_TOKENS[1])  // EURC
  const [amountIn,    setAmountIn]    = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [showSlip,    setShowSlip]    = useState(false)
  const [phase,       setPhase]       = useState<SwapPhase>('idle')
  const [reviewed,    setReviewed]    = useState<ReviewedSwap | null>(null)
  const [errorMsg,    setErrorMsg]    = useState('')
  const [successInfo, setSuccessInfo] = useState<{ hash: string; amountOut: string; explorerUrl?: string } | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // USDC balance for tokenIn display
  const usdcFact = getUsdc(chainId)
  const usdcAddress = (usdcFact?.address ?? '0x0') as `0x${string}`
  const eurcAddr = eurcAddress(chainId) as `0x${string}`

  const tokenInAddress = tokenIn.symbol === 'EURC' ? eurcAddr : usdcAddress
  const tokenOutAddress = tokenOut.symbol === 'EURC' ? eurcAddr : usdcAddress

  const { data: balanceIn } = useReadContract({
    address: tokenInAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!tokenInAddress, refetchInterval: 10_000 },
  })
  const { data: decimalsIn } = useReadContract({
    address: tokenInAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !!tokenInAddress },
  })
  const { data: balanceOut } = useReadContract({
    address: tokenOutAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!tokenOutAddress, refetchInterval: 10_000 },
  })
  const { data: decimalsOut } = useReadContract({
    address: tokenOutAddress,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !!tokenOutAddress },
  })

  const fmtBalance = (bal: bigint | undefined, dec: number | undefined) => {
    if (bal === undefined || dec === undefined) return '0.00'
    return (Number(bal) / 10 ** dec).toFixed(4)
  }

  const handleClose = () => { onClose() }

  // Guard: same-asset on Arc
  const isSameAsset = tokenIn.symbol === tokenOut.symbol
    || (tokenIn.symbol === 'USDC' && tokenOut.symbol === 'NATIVE')
    || (tokenIn.symbol === 'NATIVE' && tokenOut.symbol === 'USDC')

  // Flip pair
  const flipPair = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn('')
    setReviewed(null)
    setPhase('idle')
  }

  // Get adapter — switches chain if needed
  const getAdapter = useCallback(async () => {
    if (!connector) throw new Error('Wallet not connected')
    if (walletChainId !== chainId) {
      await switchChainAsync({ chainId })
    }
    const provider = (await connector.getProvider()) as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }, [connector, walletChainId, chainId, switchChainAsync])

  // Get estimate
  const handleEstimate = useCallback(async () => {
    if (!address || !amountIn || parseFloat(amountIn) <= 0) return
    if (isSameAsset) { setErrorMsg('Cannot swap USDC to itself on Arc.'); return }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setPhase('estimating')
    setErrorMsg('')
    setReviewed(null)

    try {
      const adapter = await getAdapter()
      const chain = kitChain(chainId)
      const estimate = await kit.estimateSwap({
        from: { adapter, chain },
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        amountIn,
        config: { slippageBps },
      })
      setReviewed({
        estimate,
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        amountIn,
        slippageBps,
        chain,
        address,
      })
      setPhase('review')
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'Estimation failed')
      setPhase('error')
    }
  }, [address, amountIn, tokenIn, tokenOut, slippageBps, chainId, getAdapter, isSameAsset])

  // Execute swap — only called from Swap button click
  const handleSwap = useCallback(async () => {
    if (!reviewed || !address) return
    if (address !== reviewed.address) {
      setErrorMsg('Wallet account changed since quote. Please re-estimate.')
      setPhase('error')
      return
    }
    setPhase('swapping')
    setErrorMsg('')
    try {
      const adapter = await getAdapter()
      const result = await kit.swap({
        from: { adapter, chain: reviewed.chain },
        tokenIn: reviewed.tokenIn,
        tokenOut: reviewed.tokenOut,
        amountIn: reviewed.amountIn,
        config: { slippageBps: reviewed.slippageBps },
      })
      setSuccessInfo({
        hash: result.txHash ?? '',
        amountOut: result.amountOut ?? reviewed.estimate.estimatedOutput?.amount ?? '',
        explorerUrl: result.explorerUrl,
      })
      setPhase('success')
    } catch (err) {
      setErrorMsg((err as Error).message ?? 'Swap failed')
      setPhase('error')
    }
  }, [reviewed, address, getAdapter])

  const isLoading = phase === 'estimating' || phase === 'swapping'
  const canEstimate = !!address && !!amountIn && parseFloat(amountIn) > 0 && !isSameAsset && !isLoading

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            key="swap-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-md rounded-t-3xl bg-white overflow-hidden"
            style={{ maxHeight: '92dvh', overflowY: 'auto' }}
          >
            {/* Spectral strip */}
            <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-400" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <h2 className="text-lg font-bold text-[#1d2f50] font-['Space_Grotesk',sans-serif]">Swap</h2>
                <p className="text-xs text-slate-400">{chainName} · Powered by LiFi</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSlip(s => !s)}
                  className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-200 transition"
                >
                  <Settings2 className="size-3.5" />
                  {(slippageBps / 100).toFixed(1)}%
                </button>
                <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="px-5 pb-6 space-y-3">
              {/* Slippage panel */}
              <AnimatePresence>
                {showSlip && (
                  <SlippagePanel
                    bps={slippageBps}
                    onChange={setSlippageBps}
                    onClose={() => setShowSlip(false)}
                  />
                )}
              </AnimatePresence>

              {/* Warning: aggregator disclosure */}
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                <Info className="size-3.5 mt-0.5 shrink-0" />
                <span>Swaps are routed through <strong>LiFi</strong>. By swapping you agree to LiFi's terms of service. The aggregator may vary by route.</span>
              </div>

              {/* Transfer panel */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Transfer</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={amountIn}
                    onChange={e => { setAmountIn(e.target.value); setReviewed(null); setPhase('idle') }}
                    disabled={isLoading}
                    className="flex-1 bg-transparent text-3xl font-semibold text-[#1d2f50] placeholder-slate-300 focus:outline-none min-w-0"
                  />
                  <TokenSelector value={tokenIn} onChange={t => { setTokenIn(t); setReviewed(null); setPhase('idle') }} disabled={isLoading} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>≈ ${amountIn ? (parseFloat(amountIn) || 0).toFixed(2) : '0.00'}</span>
                  <div className="flex items-center gap-1.5">
                    <span>Bal. <strong className="text-slate-600">{fmtBalance(balanceIn, decimalsIn)} {tokenIn.symbol}</strong></span>
                    <button
                      onClick={() => {
                        if (balanceIn !== undefined && decimalsIn !== undefined) {
                          setAmountIn((Number(balanceIn) / 10 ** decimalsIn).toFixed(6))
                          setReviewed(null); setPhase('idle')
                        }
                      }}
                      className="rounded px-1.5 py-0.5 bg-blue-100 text-blue-600 font-semibold hover:bg-blue-200 transition"
                    >MAX</button>
                  </div>
                </div>
              </div>

              {/* Flip arrow */}
              <div className="flex justify-center">
                <button
                  onClick={flipPair}
                  disabled={isLoading}
                  className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-slate-500 shadow hover:bg-slate-200 transition disabled:opacity-40"
                >
                  <ArrowUpDown className="size-4" />
                </button>
              </div>

              {/* Receive panel */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Receive</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-3xl font-semibold text-[#1d2f50]">
                    {phase === 'estimating' ? (
                      <Loader2 className="size-6 animate-spin text-blue-400" />
                    ) : reviewed ? (
                      <span className="text-green-600">{reviewed.estimate.estimatedOutput?.amount ?? '—'}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </div>
                  <TokenSelector value={tokenOut} onChange={t => { setTokenOut(t); setReviewed(null); setPhase('idle') }} disabled={isLoading} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {reviewed ? (
                      <span className="text-green-600 font-medium">≈ ${reviewed.estimate.estimatedOutput?.amount ?? '—'}</span>
                    ) : '≈ $0.00'}
                  </span>
                  <span>Bal. <strong className="text-slate-600">{fmtBalance(balanceOut, decimalsOut)} {tokenOut.symbol}</strong></span>
                </div>
              </div>

              {/* Slippage row */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Slippage tolerance {(slippageBps / 100).toFixed(1)}%</span>
                <button onClick={() => setShowSlip(s => !s)} className="text-blue-500 hover:underline font-medium">Change</button>
              </div>

              {/* Fee info when estimated */}
              {reviewed && reviewed.estimate.fees && reviewed.estimate.fees.length > 0 && (
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 space-y-1">
                  {reviewed.estimate.fees.map((f, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="capitalize">{f.type} fee</span>
                      <span>{f.amount} {f.token}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Same-asset guard */}
              {isSameAsset && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <span>USDC and NATIVE are the same asset on Arc. Select a different token pair.</span>
                </div>
              )}

              {/* Error */}
              {phase === 'error' && errorMsg && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Success */}
              {phase === 'success' && successInfo && (
                <div className="rounded-2xl bg-green-50 border border-green-100 p-4 text-center space-y-2">
                  <CheckCircle2 className="mx-auto size-10 text-green-500" />
                  <p className="font-bold text-green-700 text-base">Swap complete!</p>
                  <p className="text-sm text-green-600">
                    Received <strong>{successInfo.amountOut} {reviewed?.tokenOut}</strong>
                  </p>
                  {successInfo.explorerUrl && (
                    <a
                      href={successInfo.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
                    >
                      View on explorer <ExternalLink className="size-3" />
                    </a>
                  )}
                  <button
                    onClick={() => { setPhase('idle'); setReviewed(null); setAmountIn(''); setSuccessInfo(null) }}
                    className="mt-1 w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
                  >
                    Swap again
                  </button>
                </div>
              )}

              {/* CTA buttons */}
              {phase !== 'success' && (
                <div className="space-y-2 pt-1">
                  {!reviewed ? (
                    /* Step 1: Get Quote */
                    <button
                      onClick={() => { void handleEstimate() }}
                      disabled={!canEstimate}
                      className="w-full rounded-2xl bg-[#1d2f50] py-3.5 text-sm font-semibold text-white transition hover:bg-[#243660] disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {phase === 'estimating' ? (
                        <><Loader2 className="size-4 animate-spin" /> Getting quote…</>
                      ) : 'Get quote'}
                    </button>
                  ) : (
                    /* Step 2: Swap (after reviewing estimate) */
                    <>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-500">You send</span>
                          <span className="font-semibold text-slate-700">{reviewed.amountIn} {reviewed.tokenIn}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">You receive (est.)</span>
                          <span className="font-semibold text-green-600">{reviewed.estimate.estimatedOutput?.amount} {reviewed.tokenOut}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Slippage</span>
                          <span className="text-slate-600">{(reviewed.slippageBps / 100).toFixed(1)}%</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { void handleSwap() }}
                        disabled={phase === 'swapping'}
                        className="w-full rounded-2xl bg-[#1d2f50] py-3.5 text-sm font-semibold text-white transition hover:bg-[#243660] disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {phase === 'swapping' ? (
                          <><Loader2 className="size-4 animate-spin" /> Swapping…</>
                        ) : <>Swap {reviewed.amountIn} {reviewed.tokenIn} → {reviewed.tokenOut}</>}
                      </button>
                      <button
                        onClick={() => { setReviewed(null); setPhase('idle') }}
                        disabled={phase === 'swapping'}
                        className="w-full flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 py-3 text-sm text-slate-500 hover:bg-slate-50 transition disabled:opacity-40"
                      >
                        <RefreshCw className="size-3.5" /> Re-estimate
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Not connected */}
              {!address && (
                <p className="text-center text-xs text-slate-400 pt-2">
                  Connect a wallet to swap
                </p>
              )}

              {/* Footer */}
              <p className="text-center text-[10px] text-slate-300 pt-1">
                Powered by LiFi · Circle App Kit · Swaps involve real funds
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
