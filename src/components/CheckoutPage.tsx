/**
 * CheckoutPage — Customer-facing USDC checkout page
 * Route: /pay/:requestId
 * Reads the payment request from OpenPayCheckout, shows amount/memo,
 * approves USDC then calls pay() — all with platform fee baked in.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShoppingBag, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useReadContracts,
} from 'wagmi'
import { formatUnits, type Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'

// ── Contract config ────────────────────────────────────────────────────────
const CHECKOUT_ADDRESS = '0x4cf994d842d5a49f683f41f452cbfe7bece31007' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const USDC_DECIMALS = 6

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

export default function CheckoutPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const _chain = searchParams.get('chain') // may be used for multi-chain support later
  void _chain
  const { address, isConnected } = useAccount()

  const [payAmount, setPayAmount] = useState('')
  const [payMemo, setPayMemo] = useState('')
  const [step, setStep] = useState<PayStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const reqId = (requestId?.startsWith('0x') ? requestId : `0x${requestId}`) as `0x${string}`

  // ── Read contract state ────────────────────────────────────────────────
  const { data: requestData, isLoading: reqLoading } = useReadContract({
    address: CHECKOUT_ADDRESS,
    abi: CHECKOUT_ABI,
    functionName: 'getRequest',
    args: [reqId],
    query: { enabled: !!requestId },
  }) as { data: RequestStruct | undefined; isLoading: boolean }

  const { data: paidFull } = useReadContract({
    address: CHECKOUT_ADDRESS,
    abi: CHECKOUT_ABI,
    functionName: 'requestPaidFull',
    args: [reqId],
    query: { enabled: !!requestId },
  }) as { data: boolean | undefined }

  // Amount to pay — use fixed amount or user input
  const fixedAmount = requestData?.amount ?? 0n
  const hasFixedAmount = fixedAmount > 0n

  const resolvedAmountStr = hasFixedAmount
    ? formatUnits(fixedAmount, USDC_DECIMALS)
    : payAmount

  const resolvedAmountUnits = (() => {
    if (hasFixedAmount) return fixedAmount
    if (payAmount && !isNaN(Number(payAmount)) && Number(payAmount) > 0)
      return BigInt(Math.round(Number(payAmount) * 10 ** USDC_DECIMALS))
    return 0n
  })()

  // Fee computation
  const { data: feeData } = useReadContracts({
    contracts: [{
      address: CHECKOUT_ADDRESS,
      abi: CHECKOUT_ABI,
      functionName: 'computeFee',
      args: [resolvedAmountUnits],
    }],
    query: { enabled: resolvedAmountUnits > 0n },
  })

  const feeResult = feeData?.[0]?.result as [bigint, bigint] | undefined
  const feeUsdc = feeResult ? formatUnits(feeResult[0], USDC_DECIMALS) : null
  const netUsdc = feeResult ? formatUnits(feeResult[1], USDC_DECIMALS) : null

  // Balance + allowance
  const { data: usdcMeta } = useReadContracts({
    contracts: [
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address ?? '0x0000000000000000000000000000000000000000'] },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address ?? '0x0000000000000000000000000000000000000000', CHECKOUT_ADDRESS] },
    ],
    query: { enabled: !!address },
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

  // Auto-pay after approval if fixed amount
  useEffect(() => {
    if (step === 'approved' && hasFixedAmount) {
      handlePay()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function handleApprove() {
    if (!address || resolvedAmountUnits === 0n) return
    setStep('approving')
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CHECKOUT_ADDRESS, resolvedAmountUnits],
    })
  }

  function handlePay() {
    if (!address || resolvedAmountUnits === 0n) return
    setStep('paying')
    writeContract({
      address: CHECKOUT_ADDRESS,
      abi: CHECKOUT_ABI,
      functionName: 'pay',
      args: [reqId, resolvedAmountUnits, payMemo],
    })
  }

  // ── Derived state ──────────────────────────────────────────────────────
  const isExpired = requestData?.expiresAt && requestData.expiresAt > 0n
    && BigInt(Math.floor(Date.now() / 1000)) > requestData.expiresAt

  const isInvalid = !reqLoading && (!requestData?.active || paidFull || isExpired)
  const insufficientBalance = resolvedAmountUnits > 0n && balance < resolvedAmountUnits

  const isApproving = step === 'approving' || (writeIsPending && step === ('approving' as PayStep)) || (txLoading && step === ('approving' as PayStep))
  const isPaying = step === 'paying' || (writeIsPending && step === ('paying' as PayStep)) || (txLoading && step === ('paying' as PayStep))

  // ── Render ──────────────────────────────────────────────────────────────
  if (reqLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8faff' }}>
        <Loader2 className="size-8 animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #fff 60%, #f0fdf4 100%)' }}>
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
        {/* Card */}
        <div className="rounded-3xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.09)' }}>
          {/* Header strip */}
          <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #1d2f50 0%, #2d4a7a 100%)' }}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10">
                <ShoppingBag className="size-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {requestData?.memo || 'Payment Request'}
                </p>
                <p className="text-xs text-blue-200">OpenPay Arc · USDC on Arc Testnet</p>
              </div>
            </div>
          </div>

          {/* Done state */}
          {step === 'done' ? (
            <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="size-14 text-green-500" />
              <p className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Space Grotesk' }}>Payment complete!</p>
              <p className="text-sm text-slate-500">Your USDC has been sent. Thank you!</p>
              {resolvedAmountStr && (
                <div className="rounded-xl px-4 py-2 text-sm font-semibold text-green-600 bg-green-50">
                  ${resolvedAmountStr} USDC sent
                </div>
              )}
            </div>
          ) : isInvalid ? (
            <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="size-12 text-orange-400" />
              <p className="font-semibold text-slate-700">
                {paidFull ? 'This link has already been paid' : isExpired ? 'This link has expired' : 'This link is no longer active'}
              </p>
              <p className="text-xs text-slate-400">Ask the merchant for a new payment link.</p>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-4">
              {/* Amount display or input */}
              {hasFixedAmount ? (
                <div className="text-center py-2">
                  <p className="text-3xl font-extrabold text-blue-600" style={{ fontFamily: 'Space Grotesk' }}>
                    ${formatUnits(fixedAmount, USDC_DECIMALS)} <span className="text-lg font-bold text-slate-400">USDC</span>
                  </p>
                  {feeUsdc && netUsdc && (
                    <p className="text-xs text-slate-400 mt-1">1% platform fee included · Merchant receives ${netUsdc}</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Enter amount (USDC)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                    <input
                      type="number" placeholder="0.00"
                      value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      className="w-full rounded-xl py-3 pl-7 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none"
                      style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                    />
                  </div>
                  {feeUsdc && netUsdc && (
                    <p className="mt-1.5 text-xs text-slate-400">Fee: ${feeUsdc} · Merchant gets ${netUsdc}</p>
                  )}
                </div>
              )}

              {/* Optional customer memo */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Note (optional)</label>
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
                <p className="text-xs text-orange-500 text-center">Insufficient USDC balance</p>
              )}

              {/* CTA */}
              {!isConnected ? (
                <div className="flex justify-center">
                  <ConnectKitButton label="Connect wallet to pay" />
                </div>
              ) : needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving || writeIsPending || txLoading || resolvedAmountUnits === 0n || insufficientBalance}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
                  style={{ background: '#1d2f50' }}
                >
                  {isApproving
                    ? <><Loader2 className="size-4 animate-spin" /> Approving…</>
                    : <>Approve USDC</>}
                </button>
              ) : (
                <button
                  onClick={handlePay}
                  disabled={isPaying || writeIsPending || txLoading || resolvedAmountUnits === 0n || insufficientBalance}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
                  style={{ background: '#1d2f50' }}
                >
                  {isPaying
                    ? <><Loader2 className="size-4 animate-spin" /> Paying…</>
                    : <><ShoppingBag className="size-4" /> Pay {resolvedAmountStr ? `$${resolvedAmountStr} ` : ''}USDC</>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Secured by Arc · Instant USDC settlement · No chargebacks
        </p>
      </motion.div>
    </div>
  )
}
