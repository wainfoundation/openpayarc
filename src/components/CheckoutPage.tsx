/**
 * CheckoutPage — Customer-facing USDC checkout page
 * Route: /pay/:requestId?chain=<chainId>
 * Supports Arc Testnet (5042002) and Arc Mainnet (5042).
 * Styled like Circle's commerce checkout — white card, USDC branding, trust badges.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft, ShieldCheck, Zap } from 'lucide-react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useReadContracts, useSwitchChain, useChainId,
} from 'wagmi'
import { formatUnits, type Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'

// ── Contract addresses per chain ───────────────────────────────────────────
const CHECKOUT_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x4cf994d842d5a49f683f41f452cbfe7bece31007', // Arc Testnet
  // 5042: '0x...' // Arc Mainnet — add when deployed
}
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const USDC_DECIMALS = 6

const NETWORK_NAMES: Record<number, string> = {
  5042002: 'Arc Testnet',
  5042: 'Arc Mainnet',
}

// ── ABIs ───────────────────────────────────────────────────────────────────
const CHECKOUT_ABI: Abi = [
  {
    type: 'function', name: 'getRequest', stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'merchant', type: 'address' },
        { name: 'amount', type: 'uint128' },
        { name: 'expiresAt', type: 'uint64' },
        { name: 'active', type: 'bool' },
        { name: 'memo', type: 'string' },
        { name: 'singleUse', type: 'bool' },
      ],
    }],
  },
  {
    type: 'function', name: 'computeFee', stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint128' }],
    outputs: [{ name: 'fee', type: 'uint128' }, { name: 'merchantAmount', type: 'uint128' }],
  },
  {
    type: 'function', name: 'requestPaidFull', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'pay', stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestId', type: 'bytes32' },
      { name: 'amount', type: 'uint128' },
      { name: 'memo', type: 'string' },
    ],
    outputs: [],
  },
] as const

const ERC20_ABI: Abi = [
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

type PayStep = 'idle' | 'approving' | 'approved' | 'paying' | 'done' | 'error'

interface RequestStruct {
  merchant: string
  amount: bigint
  expiresAt: bigint
  active: boolean
  memo: string
  singleUse: boolean
}

// ── USDC coin SVG ──────────────────────────────────────────────────────────
function USDCIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2775CA"/>
      <path d="M20.022 18.124c0-2.124-1.277-2.852-3.829-3.144-1.831-.243-2.193-.73-2.193-1.581 0-.85.61-1.398 1.832-1.398 1.1 0 1.71.366 2.013 1.277a.395.395 0 00.37.26h.85a.374.374 0 00.374-.387v-.06a3.088 3.088 0 00-2.741-2.538V9.47a.387.387 0 00-.387-.387h-.79a.387.387 0 00-.386.387v1.033c-1.71.243-2.8 1.337-2.8 2.74 0 2.002 1.217 2.79 3.768 3.083 1.71.304 2.254.73 2.254 1.703 0 .973-.852 1.643-2.013 1.643-1.582 0-2.133-.67-2.315-1.582a.393.393 0 00-.382-.304h-.9a.374.374 0 00-.373.387v.06c.243 1.643 1.337 2.8 3.526 3.083v1.094c0 .213.173.387.386.387h.79a.387.387 0 00.387-.387V20.31c1.71-.243 2.8-1.398 2.8-2.852-.06.122-.06.122 0-.334z" fill="white"/>
    </svg>
  )
}

// ── Arc logo ───────────────────────────────────────────────────────────────
function ArcLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="10" fill="#2563EB"/>
      <circle cx="10" cy="10" r="5" fill="white" fillOpacity="0.3"/>
      <circle cx="10" cy="10" r="2.5" fill="white"/>
    </svg>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()

  // Determine target chain from URL param, default to testnet
  const chainParam = searchParams.get('chain')
  const targetChainId: number = chainParam ? parseInt(chainParam) : 5042002
  const checkoutAddress = CHECKOUT_ADDRESSES[targetChainId]
  const isDeployed = Boolean(checkoutAddress)
  const networkName = NETWORK_NAMES[targetChainId] ?? `Chain ${targetChainId}`
  const isMainnet = targetChainId === 5042
  const isOnCorrectChain = walletChainId === targetChainId

  const [payAmount, setPayAmount] = useState('')
  const [payMemo, setPayMemo] = useState('')
  const [step, setStep] = useState<PayStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const reqId = (requestId?.startsWith('0x') ? requestId : `0x${requestId}`) as `0x${string}`

  // ── Contract reads ─────────────────────────────────────────────────────
  const { data: requestData, isLoading: reqLoading } = useReadContract({
    address: checkoutAddress,
    abi: CHECKOUT_ABI,
    functionName: 'getRequest',
    args: [reqId],
    query: { enabled: !!requestId && isDeployed },
  }) as { data: RequestStruct | undefined; isLoading: boolean }

  const { data: paidFull } = useReadContract({
    address: checkoutAddress,
    abi: CHECKOUT_ABI,
    functionName: 'requestPaidFull',
    args: [reqId],
    query: { enabled: !!requestId && isDeployed },
  }) as { data: boolean | undefined }

  const fixedAmount = requestData?.amount ?? 0n
  const hasFixedAmount = fixedAmount > 0n

  const resolvedAmountStr = hasFixedAmount
    ? formatUnits(fixedAmount, USDC_DECIMALS)
    : payAmount

  const resolvedAmountUnits: bigint = (() => {
    if (hasFixedAmount) return fixedAmount
    if (payAmount && !isNaN(Number(payAmount)) && Number(payAmount) > 0)
      return BigInt(Math.round(Number(payAmount) * 10 ** USDC_DECIMALS))
    return 0n
  })()

  const { data: feeData } = useReadContracts({
    contracts: [{
      address: checkoutAddress,
      abi: CHECKOUT_ABI,
      functionName: 'computeFee',
      args: [resolvedAmountUnits],
    }],
    query: { enabled: resolvedAmountUnits > 0n && isDeployed },
  })
  const feeResult = feeData?.[0]?.result as [bigint, bigint] | undefined
  const feeUsdc = feeResult ? formatUnits(feeResult[0], USDC_DECIMALS) : null
  const netUsdc = feeResult ? formatUnits(feeResult[1], USDC_DECIMALS) : null

  const { data: usdcMeta } = useReadContracts({
    contracts: [
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address ?? '0x0000000000000000000000000000000000000000'] },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address ?? '0x0000000000000000000000000000000000000000', checkoutAddress ?? '0x0000000000000000000000000000000000000000'] },
    ],
    query: { enabled: !!address && isDeployed },
  })
  const balance = (usdcMeta?.[0]?.result as bigint) ?? 0n
  const allowance = (usdcMeta?.[1]?.result as bigint) ?? 0n
  const needsApproval = resolvedAmountUnits > 0n && allowance < resolvedAmountUnits

  // ── Write contracts ────────────────────────────────────────────────────
  const { writeContract, data: writeTxHash, isPending: writeIsPending } = useWriteContract()
  const { isLoading: txLoading, isSuccess: txSuccess, isError: txError, error: txErrorData } = useWaitForTransactionReceipt({ hash: writeTxHash })

  useEffect(() => {
    if (!txSuccess) return
    if (step === 'approving') setStep('approved')
    if (step === 'paying') setStep('done')
  }, [txSuccess, step])

  useEffect(() => {
    if (txError) {
      setErrorMsg(txErrorData?.message?.split('\n')[0] ?? 'Transaction failed')
      setStep('error')
    }
  }, [txError, txErrorData])

  useEffect(() => {
    if (step === 'approved' && hasFixedAmount) handlePay()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function handleApprove() {
    if (!address || resolvedAmountUnits === 0n || !checkoutAddress) return
    setStep('approving')
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [checkoutAddress, resolvedAmountUnits],
    })
  }

  function handlePay() {
    if (!address || resolvedAmountUnits === 0n || !checkoutAddress) return
    setStep('paying')
    writeContract({
      address: checkoutAddress,
      abi: CHECKOUT_ABI,
      functionName: 'pay',
      args: [reqId, resolvedAmountUnits, payMemo],
    })
  }

  // ── Derived state ──────────────────────────────────────────────────────
  const isExpired = requestData?.expiresAt && requestData.expiresAt > 0n
    && BigInt(Math.floor(Date.now() / 1000)) > requestData.expiresAt
  const isInvalid = !reqLoading && isDeployed && (!requestData?.active || paidFull || isExpired)
  const insufficientBalance = resolvedAmountUnits > 0n && balance < resolvedAmountUnits
  const stepRef = { current: step }
  const isApproving = stepRef.current === 'approving' && (true || writeIsPending || txLoading)
  const isPaying = stepRef.current === 'paying' && (true || writeIsPending || txLoading)

  // ── Render ─────────────────────────────────────────────────────────────
  if (reqLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8faff' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Loading payment request…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: 'linear-gradient(160deg, #eef2ff 0%, #f8faff 50%, #f0fdf4 100%)' }}>

      {/* Back */}
      <button
        onClick={() => { void navigate(-1) }}
        className="absolute top-4 left-4 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 active:scale-95 transition-all"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* ── Not deployed on mainnet ── */}
        {!isDeployed && (
          <div className="rounded-3xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.09)' }}>
            {/* Header */}
            <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #1d2f50 0%, #2d4a7a 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10">
                  <USDCIcon size={24} />
                </div>
                <div>
                  <p className="font-semibold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Payment Request</p>
                  <p className="text-xs text-blue-200">OpenPay Arc · USDC on {networkName}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
              <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#f0f9ff' }}>
                <AlertCircle className="size-7 text-blue-400" />
              </div>
              <p className="font-semibold text-slate-700">Coming to {networkName}</p>
              <p className="text-xs text-slate-400 max-w-xs">Payment links aren't available on {networkName} yet. Ask the merchant to use Arc Testnet.</p>
            </div>
          </div>
        )}

        {/* ── Wrong chain warning (wallet on wrong network) ── */}
        {isDeployed && isConnected && !isOnCorrectChain && (
          <div className="mb-3 rounded-2xl px-4 py-3 flex items-center gap-3"
            style={{ background: isMainnet ? '#fff7ed' : '#f0f9ff', border: isMainnet ? '1px solid #fed7aa' : '1px solid #bae6fd' }}>
            <AlertCircle className={`size-4 shrink-0 ${isMainnet ? 'text-orange-500' : 'text-blue-500'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${isMainnet ? 'text-orange-700' : 'text-blue-700'}`}>
                Switch to {networkName} to pay
              </p>
            </div>
            <button
              onClick={() => switchChain({ chainId: targetChainId })}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl shrink-0 ${isMainnet ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}
            >
              Switch
            </button>
          </div>
        )}

        {/* ── Mainnet warning banner ── */}
        {isDeployed && isMainnet && (
          <div className="mb-3 rounded-2xl px-4 py-2.5 flex items-center gap-2"
            style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
            <AlertCircle className="size-3.5 text-orange-500 shrink-0" />
            <p className="text-[11px] text-orange-700 font-medium">Mainnet active — real USDC. Transactions are irreversible.</p>
          </div>
        )}

        {/* ── Main card ── */}
        {isDeployed && (
          <div className="rounded-3xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.09)' }}>

            {/* Header */}
            <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #1d2f50 0%, #2563eb 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10">
                  <USDCIcon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    {requestData?.memo || 'Payment Request'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ArcLogo size={12} />
                    <p className="text-xs text-blue-200">OpenPay Arc · USDC on {networkName}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Done */}
            {step === 'done' ? (
              <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle2 className="size-9 text-green-500" />
                </div>
                <p className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk' }}>Payment complete!</p>
                <p className="text-sm text-slate-500">Your USDC has been sent instantly.</p>
                {resolvedAmountStr && (
                  <div className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-green-700 bg-green-50">
                    <USDCIcon size={18} />
                    ${resolvedAmountStr} USDC sent
                  </div>
                )}
              </div>

            ) : isInvalid ? (
              /* ── Invalid / expired / already paid ── */
              <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
                <div className="flex size-14 items-center justify-center rounded-full" style={{ background: '#fff7ed' }}>
                  <AlertCircle className="size-7 text-orange-400" />
                </div>
                <p className="font-semibold text-slate-700">
                  {paidFull ? 'Already paid' : isExpired ? 'Link expired' : 'Link no longer active'}
                </p>
                <p className="text-xs text-slate-400">Ask the merchant for a new payment link.</p>
              </div>

            ) : (
              /* ── Payment form ── */
              <div className="px-6 py-5 space-y-4">

                {/* Amount */}
                {hasFixedAmount ? (
                  <div className="text-center py-1">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <USDCIcon size={28} />
                      <p className="text-3xl font-extrabold text-slate-800" style={{ fontFamily: 'Space Grotesk' }}>
                        ${formatUnits(fixedAmount, USDC_DECIMALS)}
                      </p>
                      <span className="text-lg font-semibold text-slate-400">USDC</span>
                    </div>
                    {feeUsdc && netUsdc && (
                      <p className="text-xs text-slate-400">Includes 1% platform fee · Merchant receives ${netUsdc}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Amount (USDC)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
                        <USDCIcon size={18} />
                      </span>
                      <input
                        type="number" placeholder="0.00"
                        value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        className="w-full rounded-xl py-3 pl-10 pr-16 text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none"
                        style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">USDC</span>
                    </div>
                    {feeUsdc && netUsdc && (
                      <p className="mt-1.5 text-xs text-slate-400">Fee: ${feeUsdc} · Merchant receives ${netUsdc}</p>
                    )}
                  </div>
                )}

                {/* Note */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Note (optional)
                  </label>
                  <input
                    type="text" placeholder="Add a note for the merchant…"
                    value={payMemo} onChange={e => setPayMemo(e.target.value.slice(0, 64))}
                    className="w-full rounded-xl py-2.5 px-3.5 text-sm text-slate-600 placeholder:text-slate-300 outline-none"
                    style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                  />
                </div>

                {/* Error */}
                {step === 'error' && (
                  <div className="flex items-start gap-2 rounded-xl p-3 bg-red-50 text-red-600 text-xs">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <p>{errorMsg}</p>
                  </div>
                )}

                {/* Balance warning */}
                {isConnected && insufficientBalance && resolvedAmountUnits > 0n && (
                  <div className="flex items-center gap-2 rounded-xl p-2.5 bg-orange-50 text-orange-600 text-xs">
                    <AlertCircle className="size-3.5 shrink-0" />
                    Insufficient USDC balance
                  </div>
                )}

                {/* CTA */}
                {!isConnected ? (
                  /* Connect wallet — Circle-style */
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <ConnectKitButton label="Connect wallet to pay" />
                    </div>
                    <p className="text-center text-[11px] text-slate-400">
                      Connect any EVM wallet to pay with USDC
                    </p>
                  </div>
                ) : !isOnCorrectChain ? (
                  <button
                    onClick={() => switchChain({ chainId: targetChainId })}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all"
                    style={{ background: '#2563eb' }}
                  >
                    Switch to {networkName}
                  </button>
                ) : needsApproval ? (
                  /* Approve button — Circle blue */
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || writeIsPending || txLoading || resolvedAmountUnits === 0n || insufficientBalance}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
                    style={{ background: '#2775CA' }}
                  >
                    {isApproving
                      ? <><Loader2 className="size-4 animate-spin" /> Approving USDC…</>
                      : (
                        <>
                          <USDCIcon size={18} />
                          Approve USDC
                        </>
                      )}
                  </button>
                ) : (
                  /* Pay button — Circle blue */
                  <button
                    onClick={handlePay}
                    disabled={isPaying || writeIsPending || txLoading || resolvedAmountUnits === 0n || insufficientBalance}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
                    style={{ background: '#2775CA' }}
                  >
                    {isPaying
                      ? <><Loader2 className="size-4 animate-spin" /> Processing…</>
                      : (
                        <>
                          <USDCIcon size={18} />
                          Pay {resolvedAmountStr ? `$${resolvedAmountStr} ` : ''}USDC
                        </>
                      )}
                  </button>
                )}

                {/* Step progress */}
                {(step === 'approving' || step === 'approved' || step === 'paying') && (
                  <div className="flex items-center justify-center gap-4 pt-1">
                    {(['Approve', 'Pay'] as const).map((label, i) => {
                      const s = stepRef.current
                      const done = (i === 0 && (s === 'approved' || s === 'paying' || s === 'done'))
                      const active = (i === 0 && s === 'approving') || (i === 1 && s === 'paying')
                      return (
                        <div key={label} className="flex items-center gap-1.5">
                          <div className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-all
                            ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {done ? '✓' : i + 1}
                          </div>
                          <span className={`text-xs font-medium ${done ? 'text-green-600' : active ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
                          {i === 0 && <span className="text-slate-200 text-xs">→</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Trust footer inside card */}
            <div className="px-6 py-3 flex items-center justify-center gap-4 border-t border-slate-50">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="size-3.5 text-green-500" />
                Secured by Arc
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Zap className="size-3.5 text-blue-400" />
                Instant settlement
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <USDCIcon size={12} />
                USDC
              </div>
            </div>
          </div>
        )}

        {/* Powered-by footer */}
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Powered by <strong className="text-slate-500">OpenPay Arc</strong> · No chargebacks · Instant USDC settlement
        </p>
      </motion.div>
    </div>
  )
}
