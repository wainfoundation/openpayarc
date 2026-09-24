/**
 * QRPaySheet — Business payment link / QR code / embeddable checkout creator
 * Uses OpenPayCheckout contract at 0x4cf994d842d5a49f683f41f452cbfe7bece31007
 */
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronLeft, QrCode, Link2, Code2, Copy, Check,
  Plus, ToggleLeft, ToggleRight, ExternalLink, RefreshCw,
  ShoppingBag, Zap, Globe, AlertCircle, ArrowLeftRight
} from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi'
import { formatUnits, type Abi } from 'viem'
import QRCode from 'qrcode'
import { useNetwork } from '@/NetworkContext'

// ── Contract config ────────────────────────────────────────────────────────
const USDC_DECIMALS = 6

// Checkout contract addresses per chain
const CHECKOUT_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x4cf994d842d5a49f683f41f452cbfe7bece31007', // Arc Testnet
  // 5042: '0x...' // Arc Mainnet — add when deployed
}

const EXPLORERS: Record<number, string> = {
  5042002: 'https://explorer.testnet.arc.io',
  5042: 'https://explorer.arc.io',
}

const NETWORK_NAMES: Record<number, string> = {
  5042002: 'Arc Testnet',
  5042: 'Arc Mainnet',
}

const CHECKOUT_ABI: Abi = [
  {
    type: 'function', name: 'createRequest', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint128' },
      { name: 'expiresAt', type: 'uint64' },
      { name: 'memo', type: 'string' },
      { name: 'singleUse', type: 'bool' },
    ],
    outputs: [{ name: 'requestId', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'deactivateRequest', stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function', name: 'reactivateRequest', stateMutability: 'nonpayable',
    inputs: [{ name: 'requestId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function', name: 'requestPaymentCount', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'computeFee', stateMutability: 'view',
    inputs: [{ name: 'amount', type: 'uint128' }],
    outputs: [{ name: 'fee', type: 'uint128' }, { name: 'merchantAmount', type: 'uint128' }],
  },
  {
    type: 'event', name: 'RequestCreated',
    inputs: [
      { name: 'requestId', type: 'bytes32', indexed: true },
      { name: 'merchant', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'expiresAt', type: 'uint64', indexed: false },
      { name: 'memo', type: 'string', indexed: false },
      { name: 'singleUse', type: 'bool', indexed: false },
    ],
  },
] as const

// ── Helpers ────────────────────────────────────────────────────────────────
function shortId(id: string) {
  return `${id.slice(0, 10)}...${id.slice(-8)}`
}

function buildPaymentUrl(requestId: string, chainId: number) {
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://openpayarc.netlify.app'
  return `${base}/pay/${requestId}?chain=${chainId}`
}

function buildEmbedSnippet(paymentUrl: string, amount: string, memo: string) {
  return `<!-- OpenPay Arc Checkout Button -->
<a href="${paymentUrl}"
   target="_blank"
   rel="noopener"
   style="display:inline-flex;align-items:center;gap:8px;background:#1d2f50;color:#fff;padding:12px 20px;border-radius:12px;font-family:sans-serif;font-size:15px;font-weight:600;text-decoration:none;">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#60a5fa" stroke-width="2"/>
    <path d="M8 12h8M12 8v8" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/>
  </svg>
  Pay${amount ? ` $${amount} USDC` : ' with USDC'}${memo ? ` — ${memo}` : ''}
</a>`
}

// ── QR canvas hook ─────────────────────────────────────────────────────────
function useQRCanvas(data: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!data || !canvasRef.current) return
    setReady(false)
    QRCode.toCanvas(canvasRef.current, data, {
      width: 200, margin: 2,
      color: { dark: '#1d2f50', light: '#ffffff' },
    }).then(() => setReady(true)).catch(() => setReady(false))
  }, [data])
  return { canvasRef, ready }
}

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = 'list' | 'create' | 'created'
interface SavedRequest {
  id: string
  amount: string
  memo: string
  singleUse: boolean
  createdAt: number
  active: boolean
  paymentUrl: string
}

// ── Main component ─────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void }

export default function QRPaySheet({ open, onClose }: Props) {
  const { address } = useAccount()
  const { chainId: appChainId } = useNetwork()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()

  // Use wallet's actual chain for contract calls; fall back to app chain
  const chainId = walletChainId ?? appChainId
  const checkoutAddress = CHECKOUT_ADDRESSES[chainId]
  const isDeployed = Boolean(checkoutAddress)
  const networkName = NETWORK_NAMES[chainId] ?? `Chain ${chainId}`
  const explorerUrl = EXPLORERS[chainId] ?? 'https://explorer.arc.io'

  // Detect if wallet is on Arc (testnet or mainnet)
  const isArcChain = chainId === 5042002 || chainId === 5042
  const targetArcChain = appChainId === 5042 ? 5042 : 5042002
  void explorerUrl // used in receipt link below

  const [phase, setPhase] = useState<Phase>('list')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [singleUse, setSingleUse] = useState(false)
  const [expiryDays, setExpiryDays] = useState('0')
  const [requests, setRequests] = useState<SavedRequest[]>(() => {
    try { return JSON.parse(localStorage.getItem('openpay_checkout_requests') ?? '[]') as SavedRequest[] }
    catch { return [] }
  })
  const [createdRequest, setCreatedRequest] = useState<SavedRequest | null>(null)
  const [activeView, setActiveView] = useState<'qr' | 'link' | 'embed'>('qr')
  const [copied, setCopied] = useState(false)
  const [selectedReq, setSelectedReq] = useState<SavedRequest | null>(null)

  const { canvasRef: createdQR, ready: createdQRReady } = useQRCanvas(createdRequest?.paymentUrl ?? '')
  const { canvasRef: selectedQR, ready: selectedQRReady } = useQRCanvas(selectedReq?.paymentUrl ?? '')

  // Write contract
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })

  // Fee preview
  const amountUnits = amount && !isNaN(Number(amount)) && Number(amount) > 0
    ? BigInt(Math.round(Number(amount) * 10 ** USDC_DECIMALS))
    : 0n
  const { data: feeData } = useReadContract({
    address: checkoutAddress,
    abi: CHECKOUT_ABI,
    functionName: 'computeFee',
    args: [amountUnits],
    query: { enabled: amountUnits > 0n && isDeployed },
  }) as { data: [bigint, bigint] | undefined }

  const feeUsdc = feeData ? formatUnits(feeData[0], USDC_DECIMALS) : '—'
  const netUsdc = feeData ? formatUnits(feeData[1], USDC_DECIMALS) : '—'

  // On tx success, parse requestId from logs
  useEffect(() => {
    if (!isSuccess || !receipt) return
    const log = receipt.logs[0]
    if (!log) return
    const requestId = log.topics[1] as string
    if (!requestId) return
    const paymentUrl = buildPaymentUrl(requestId, chainId)
    const req: SavedRequest = {
      id: requestId,
      amount,
      memo,
      singleUse,
      createdAt: Date.now(),
      active: true,
      paymentUrl,
    }
    const updated = [req, ...requests]
    setRequests(updated)
    localStorage.setItem('openpay_checkout_requests', JSON.stringify(updated))
    setCreatedRequest(req)
    setPhase('created')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, receipt])

  function handleCreate() {
    if (!address) return
    const amountUnitsVal = amount && Number(amount) > 0
      ? BigInt(Math.round(Number(amount) * 10 ** USDC_DECIMALS))
      : 0n as unknown as bigint
    const expiryTs = expiryDays && Number(expiryDays) > 0
      ? BigInt(Math.floor(Date.now() / 1000) + Number(expiryDays) * 86400)
      : 0n as unknown as bigint
    const memoTrimmed = memo.slice(0, 64)
    if (!checkoutAddress) return
    writeContract({
      address: checkoutAddress,
      abi: CHECKOUT_ABI,
      functionName: 'createRequest',
      args: [amountUnitsVal, expiryTs, memoTrimmed, singleUse],
    })
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  function handleClose() {
    setPhase('list')
    setAmount('')
    setMemo('')
    setSingleUse(false)
    setExpiryDays('0')
    setCreatedRequest(null)
    setSelectedReq(null)
    onClose()
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="qrpay-sheet"
          className="fixed inset-0 z-50 flex flex-col"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 300 }}
          style={{ background: '#fff', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}
        >
          {/* Spectral strip */}
          <div className="h-1 w-full shrink-0" style={{ background: 'linear-gradient(90deg,#6366f1,#3b82f6,#06b6d4,#10b981,#f59e0b,#ef4444)' }} />

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            {(phase === 'create' || phase === 'created') && (
              <button onClick={() => { setPhase('list'); setCreatedRequest(null) }} className="flex size-8 items-center justify-center rounded-full hover:bg-slate-100 active:scale-95">
                <ChevronLeft className="size-5 text-slate-500" />
              </button>
            )}
            <div className="flex-1">
              <p className="font-semibold text-slate-800" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {phase === 'list' ? 'Payment Links & QR Codes' : phase === 'create' ? 'Create Payment Link' : 'Link Created!'}
              </p>
              <p className="text-[11px] text-slate-400">OpenPay Arc · Powered by Arc eCommerce</p>
            </div>
            <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-full hover:bg-slate-100 active:scale-95">
              <X className="size-4 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── LIST PHASE ────────────────────────────────────────── */}
            {phase === 'list' && (
              <div className="px-4 py-4 space-y-4">
                {/* Feature cards */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: <QrCode className="size-5" />, label: 'QR Code', desc: 'Print or display' },
                    { icon: <Link2 className="size-5" />, label: 'Payment Link', desc: 'Share anywhere' },
                    { icon: <Code2 className="size-5" />, label: 'Embed Button', desc: 'Add to your site' },
                  ].map(f => (
                    <div key={f.label} className="flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center" style={{ background: '#f0f4ff', border: '1px solid rgba(37,99,235,0.1)' }}>
                      <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: '#dbeafe', color: '#2563eb' }}>{f.icon}</div>
                      <p className="text-xs font-semibold text-slate-700">{f.label}</p>
                      <p className="text-[10px] text-slate-400">{f.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Create button */}
                {/* Network badge */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-slate-400">
                    Network: <strong className="text-slate-600">{networkName}</strong>
                  </span>
                  {!isDeployed && isArcChain && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#f0f9ff', color: '#0284c7' }}>
                      Coming soon
                    </span>
                  )}
                </div>

                {address ? (
                  <button
                    onClick={() => setPhase('create')}
                    disabled={!isDeployed || !isArcChain}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-transform disabled:opacity-40"
                    style={{ background: '#1d2f50' }}
                  >
                    <Plus className="size-4" />
                    Create payment link
                  </button>
                ) : (
                  <div className="rounded-2xl p-4 text-center text-sm text-slate-500" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                    Connect your wallet to create payment links
                  </div>
                )}

                {/* Not deployed on mainnet notice in list */}
                {isArcChain && !isDeployed && (
                  <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <AlertCircle className="size-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Payment links coming to {networkName}</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">The checkout contract isn't deployed on mainnet yet.</p>
                      <button onClick={() => switchChain({ chainId: 5042002 })} className="mt-1.5 text-[11px] font-semibold text-blue-700 underline underline-offset-2">
                        Switch to Arc Testnet to try it
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing requests */}
                {requests.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Payment Links</p>
                    <div className="space-y-2">
                      {requests.map(req => (
                        <button
                          key={req.id}
                          onClick={() => setSelectedReq(selectedReq?.id === req.id ? null : req)}
                          className="w-full text-left rounded-2xl p-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100"
                          style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <ShoppingBag className="size-3.5 shrink-0 text-blue-500" />
                                <p className="text-sm font-medium text-slate-700 truncate">{req.memo || 'Payment request'}</p>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">{shortId(req.id)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <p className="text-sm font-semibold text-blue-600">{req.amount ? `$${req.amount}` : 'Any'}</p>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${req.active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                                {req.active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>

                          {/* Expanded view */}
                          <AnimatePresence>
                            {selectedReq?.id === req.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                                  <canvas ref={selectedQR} className={`mx-auto rounded-xl ${selectedQRReady ? 'opacity-100' : 'opacity-0'}`} style={{ display: 'block', width: 140, height: 140 }} />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyText(req.paymentUrl) }}
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 active:scale-95 transition-all"
                                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
                                    >
                                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                      Copy link
                                    </button>
                                    <a
                                      href={req.paymentUrl} target="_blank" rel="noopener"
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
                                      style={{ background: '#f8faff', border: '1px solid #e2e8f0' }}
                                    >
                                      <ExternalLink className="size-3.5" />
                                      Open
                                    </a>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CREATE PHASE ──────────────────────────────────────── */}
            {phase === 'create' && (
              <div className="px-4 py-4 space-y-4">
                {/* Amount */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Amount (USDC)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                    <input
                      type="number" placeholder="0.00 — leave blank for any amount"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      className="w-full rounded-xl py-3 pl-7 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none"
                      style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                    />
                  </div>
                  {feeData && amount && (
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
                      <span>Platform fee (1%): <strong className="text-slate-600">${feeUsdc}</strong></span>
                      <span>You receive: <strong className="text-blue-600">${netUsdc} USDC</strong></span>
                    </div>
                  )}
                </div>

                {/* Memo */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Description / Product Name</label>
                  <input
                    type="text" placeholder="e.g. Coffee, Membership, Product #42"
                    value={memo} onChange={e => setMemo(e.target.value.slice(0, 64))}
                    className="w-full rounded-xl py-3 px-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none"
                    style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">{memo.length}/64 characters</p>
                </div>

                {/* Options row */}
                <div className="flex gap-3">
                  {/* Single use */}
                  <div
                    className="flex-1 flex items-center justify-between rounded-xl px-3.5 py-2.5 cursor-pointer"
                    style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
                    onClick={() => setSingleUse(!singleUse)}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Single use</p>
                      <p className="text-[10px] text-slate-400">Paid once only</p>
                    </div>
                    {singleUse
                      ? <ToggleRight className="size-5 text-blue-500" />
                      : <ToggleLeft className="size-5 text-slate-300" />}
                  </div>
                  {/* Expiry */}
                  <div className="flex-1 rounded-xl px-3.5 py-2.5" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                    <p className="text-xs font-semibold text-slate-700 mb-1">Expires in</p>
                    <select
                      value={expiryDays}
                      onChange={e => setExpiryDays(e.target.value)}
                      className="w-full bg-transparent text-xs text-slate-600 outline-none"
                    >
                      <option value="0">Never</option>
                      <option value="1">1 day</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                </div>

                {/* Wrong chain banner */}
                {!isArcChain && (
                  <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <AlertCircle className="size-4 text-orange-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-orange-700">Wrong network</p>
                      <p className="text-[11px] text-orange-600 mt-0.5">Switch to Arc to create payment links.</p>
                      <button
                        onClick={() => switchChain({ chainId: targetArcChain })}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-900"
                      >
                        <ArrowLeftRight className="size-3" />
                        Switch to {NETWORK_NAMES[targetArcChain] ?? 'Arc'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Not deployed on this Arc network */}
                {isArcChain && !isDeployed && (
                  <div className="rounded-xl p-3.5 flex items-start gap-2.5" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <AlertCircle className="size-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-700">Coming to {networkName}</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">Payment links aren't available on {networkName} yet.</p>
                      <button
                        onClick={() => switchChain({ chainId: 5042002 })}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
                      >
                        <ArrowLeftRight className="size-3" />
                        Switch to Arc Testnet
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleCreate}
                  disabled={!address || !isDeployed || !isArcChain || isPending || isConfirming}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
                  style={{ background: '#1d2f50' }}
                >
                  {isPending ? (
                    <><RefreshCw className="size-4 animate-spin" /> Confirm in wallet…</>
                  ) : isConfirming ? (
                    <><RefreshCw className="size-4 animate-spin" /> Confirming…</>
                  ) : (
                    <><Zap className="size-4" /> Create payment link</>
                  )}
                </button>

                {/* Info */}
                <p className="text-center text-[11px] text-slate-400 px-2">
                  Creates an onchain payment request on {networkName}. Customers pay USDC directly to you minus a 1% platform fee.
                </p>
              </div>
            )}

            {/* ── CREATED PHASE ─────────────────────────────────────── */}
            {phase === 'created' && createdRequest && (
              <div className="px-4 py-4 space-y-4">
                {/* Success badge */}
                <div className="flex flex-col items-center gap-1 py-2">
                  <div className="flex size-12 items-center justify-center rounded-full bg-green-50">
                    <Check className="size-6 text-green-500" />
                  </div>
                  <p className="font-semibold text-slate-700" style={{ fontFamily: 'Space Grotesk' }}>Payment link created!</p>
                  <p className="text-xs text-slate-400">Share it anywhere — customers pay with USDC</p>
                </div>

                {/* Tab switcher */}
                <div className="flex rounded-xl overflow-hidden" style={{ background: '#f1f5f9', padding: '3px' }}>
                  {(['qr', 'link', 'embed'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveView(tab)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all capitalize"
                      style={activeView === tab
                        ? { background: '#fff', color: '#1d2f50', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                        : { color: '#94a3b8' }}
                    >
                      {tab === 'qr' ? 'QR Code' : tab === 'link' ? 'Link' : 'Embed'}
                    </button>
                  ))}
                </div>

                {/* QR view */}
                {activeView === 'qr' && (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="rounded-2xl p-4 bg-white shadow-sm" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
                      <canvas ref={createdQR} className={createdQRReady ? 'opacity-100' : 'opacity-0'} style={{ display: 'block', width: 180, height: 180 }} />
                    </div>
                    {createdRequest.amount && (
                      <p className="text-lg font-bold text-blue-600" style={{ fontFamily: 'Space Grotesk' }}>${createdRequest.amount} USDC</p>
                    )}
                    {createdRequest.memo && <p className="text-sm text-slate-500">{createdRequest.memo}</p>}
                    <p className="text-[10px] text-slate-400 font-mono break-all text-center px-2">{shortId(createdRequest.id)}</p>
                  </div>
                )}

                {/* Link view */}
                {activeView === 'link' && (
                  <div className="space-y-3">
                    <div className="rounded-xl p-3.5 break-all text-xs font-mono text-slate-500" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                      {createdRequest.paymentUrl}
                    </div>
                    <button
                      onClick={() => copyText(createdRequest.paymentUrl)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95"
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied ? 'Copied!' : 'Copy payment link'}
                    </button>
                    <a
                      href={createdRequest.paymentUrl} target="_blank" rel="noopener"
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95"
                      style={{ background: '#f8faff', color: '#475569', border: '1px solid #e2e8f0' }}
                    >
                      <Globe className="size-4" />
                      Open checkout page
                    </a>
                  </div>
                )}

                {/* Embed view */}
                {activeView === 'embed' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500">Paste this HTML into your website to add a checkout button:</p>
                    <div className="rounded-xl p-3.5 text-[11px] font-mono text-slate-500 overflow-x-auto whitespace-pre-wrap" style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                      {buildEmbedSnippet(createdRequest.paymentUrl, createdRequest.amount, createdRequest.memo)}
                    </div>
                    <button
                      onClick={() => copyText(buildEmbedSnippet(createdRequest.paymentUrl, createdRequest.amount, createdRequest.memo))}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-95"
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}
                    >
                      {copied ? <Check className="size-4" /> : <Code2 className="size-4" />}
                      {copied ? 'Copied!' : 'Copy embed code'}
                    </button>
                    {/* Preview */}
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider mb-2">Preview</p>
                      <div className="rounded-xl p-4 flex items-center justify-center" style={{ background: '#f8faff', border: '1px solid #e2e8f0' }}>
                        <a
                          href={createdRequest.paymentUrl} target="_blank" rel="noopener"
                          className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-sm text-white no-underline"
                          style={{ background: '#1d2f50' }}
                        >
                          <ShoppingBag className="size-4" />
                          Pay{createdRequest.amount ? ` $${createdRequest.amount} USDC` : ' with USDC'}
                          {createdRequest.memo ? ` — ${createdRequest.memo}` : ''}
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <p className="text-center text-[10px] text-slate-400">
                  Onchain on <strong>{networkName}</strong> · 1% platform fee deducted at payment
                </p>

                <button
                  onClick={() => { setPhase('list'); setCreatedRequest(null); setAmount(''); setMemo('') }}
                  className="w-full rounded-xl py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Create another link
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
