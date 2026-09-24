import { useState, useRef } from 'react'
import { RefreshCw, ExternalLink, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, useWaitForTransactionReceipt,
  usePublicClient,
} from 'wagmi'
import { parseUnits, formatUnits } from 'viem'

import OUSDIcon from './OUSDIcon'

// ─── Brand colours ────────────────────────────────────────────────────────────
const OUSD_BLUE   = '#0D47D1'
const OUSD_LIGHT  = '#EEF2FF'   // very light blue tint for backgrounds
const OUSD_BORDER = '#C7D7FB'

// ─── Contract addresses per network ───────────────────────────────────────────
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const  // same on both Arc networks

const OUSD_ADDRESSES: Record<number, { token: `0x${string}`; swap: `0x${string}`; explorer: string }> = {
  // Arc Testnet (5042002)
  5042002: {
    token:    '0xdd9cb6cbe39f5caf475241124e749875d7e7b355',
    swap:     '0x51fb1d4ca43eda173457f6c279de284a63040d13',
    explorer: 'https://explorer.testnet.arc.io',
  },
  // Arc Mainnet (5042) — replace with real addresses after deploying from your wallet
  5042: {
    token:    '0x0000000000000000000000000000000000000000', // TODO: replace after mainnet deploy
    swap:     '0x0000000000000000000000000000000000000000', // TODO: replace after mainnet deploy
    explorer: 'https://explorer.arc.io',
  },
}

const ARC_CHAIN_IDS = [5042002, 5042]
const FEE_BPS      = 100n
const FEE_CAP      = 5_000_000n
const DECIMALS     = 6

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: 'balanceOf',  type: 'function', stateMutability: 'view',       inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance',  type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',    type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

const SWAP_ABI = [
  { name: 'mintOUSD',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'usdcAmount', type: 'uint256' }], outputs: [] },
  { name: 'redeemOUSD', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'ousdAmount', type: 'uint256' }], outputs: [] },
  { name: 'computeFee', type: 'function', stateMutability: 'view',       inputs: [{ name: 'amount', type: 'uint256' }], outputs: [{ name: 'fee', type: 'uint256' }, { name: 'netAmount', type: 'uint256' }] },
  { name: 'paused',     type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'bool' }] },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeFeeLocal(amount: bigint): { fee: bigint; net: bigint } {
  if (amount === 0n) return { fee: 0n, net: 0n }
  let fee = (amount * FEE_BPS) / 10000n
  if (fee > FEE_CAP) fee = FEE_CAP
  const net = amount > fee ? amount - fee : 0n
  return { fee, net }
}

function fmtUsdc(raw: bigint): string {
  return Number(formatUnits(raw, DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 6,
  })
}

type Direction = 'buy' | 'sell'
type Step = 'idle' | 'approving' | 'swapping' | 'done' | 'error'

interface Props { open: boolean; onClose: () => void }

function OUSDSwapInner({ onClose }: { onClose: () => void }) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [direction, setDirection] = useState<Direction>('buy')
  const [amountStr, setAmountStr] = useState('')
  const [step, setStep]           = useState<Step>('idle')
  const stepRef                   = useRef<Step>('idle')
  const [txHash, setTxHash]       = useState<`0x${string}` | undefined>()
  const [errMsg, setErrMsg]       = useState('')

  const network    = OUSD_ADDRESSES[chainId]
  const wrongChain = !ARC_CHAIN_IDS.includes(chainId)
  const OUSD_TOKEN = network?.token ?? '0x0000000000000000000000000000000000000000'
  const OUSD_SWAP  = network?.swap  ?? '0x0000000000000000000000000000000000000000'
  const EXPLORER   = network?.explorer ?? 'https://explorer.testnet.arc.io'
  const notDeployed = network && (network.token === '0x0000000000000000000000000000000000000000')

  const amount     = amountStr ? parseUnits(amountStr.replace(/,/g, ''), DECIMALS) : 0n
  const { fee, net } = computeFeeLocal(amount)

  const canRead = !!address && !wrongChain && !notDeployed

  const { data: usdcBal = 0n, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined,
    query: { enabled: canRead },
  })
  const { data: ousdBal = 0n, refetch: refetchOusd } = useReadContract({
    address: OUSD_TOKEN, abi: ERC20_ABI, functionName: 'balanceOf', args: address ? [address] : undefined,
    query: { enabled: canRead },
  })
  const { data: usdcAllowance = 0n } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance',
    args: address ? [address, OUSD_SWAP] : undefined,
    query: { enabled: canRead && direction === 'buy' },
  })
  const { data: isPaused = false } = useReadContract({
    address: OUSD_SWAP, abi: SWAP_ABI, functionName: 'paused',
    query: { enabled: !wrongChain && !notDeployed },
  })

  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash })

  const refresh = () => { void refetchUsdc(); void refetchOusd() }
  const inProgress = step === 'approving' || step === 'swapping' || isTxPending

  async function handleSwap() {
    if (!address || amount === 0n || inProgress || isPaused) return
    setErrMsg('')
    try {
      if (direction === 'buy') {
        if (usdcAllowance < amount) {
          stepRef.current = 'approving'; setStep('approving')
          const approveTx = await writeContractAsync({
            address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve',
            args: [OUSD_SWAP, amount],
          })
          setTxHash(approveTx)
          if (publicClient) {
            const receipt = await publicClient.waitForTransactionReceipt({ hash: approveTx })
            if (receipt.status !== 'success') throw new Error('Approval transaction failed')
          }
        }
        stepRef.current = 'swapping'; setStep('swapping')
        const mintTx = await writeContractAsync({
          address: OUSD_SWAP, abi: SWAP_ABI, functionName: 'mintOUSD', args: [amount],
        })
        setTxHash(mintTx)
      } else {
        stepRef.current = 'swapping'; setStep('swapping')
        const redeemTx = await writeContractAsync({
          address: OUSD_SWAP, abi: SWAP_ABI, functionName: 'redeemOUSD', args: [amount],
        })
        setTxHash(redeemTx)
      }
      stepRef.current = 'done'; setStep('done')
      refresh()
    } catch (e: unknown) {
      stepRef.current = 'error'; setStep('error')
      const msg = e instanceof Error ? e.message : String(e)
      setErrMsg(msg.includes('User rejected') || msg.includes('user rejected') ? 'Transaction rejected.' : msg.slice(0, 120))
    }
  }

  const fromToken    = direction === 'buy' ? 'USDC' : 'OUSD'
  const toToken      = direction === 'buy' ? 'OUSD' : 'USDC'
  const fromBal      = direction === 'buy' ? usdcBal : ousdBal
  const needsApprove = direction === 'buy' && usdcAllowance < amount && amount > 0n

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl pb-safe overflow-hidden" style={{ maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: OUSD_BLUE }}>
              <OUSDIcon size={22} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">OUSD Swap</p>
              <p className="text-xs font-medium" style={{ color: OUSD_BLUE }}>USDC ↔ OpenPay OpenUSD</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={refresh} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 text-lg font-light">✕</button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Wrong chain */}
          {wrongChain && (
            <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: '#FFF8E1', border: '1px solid #FFE082' }}>
              <div className="flex items-center gap-2" style={{ color: '#F57F17' }}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-medium">Switch to Arc Testnet or Arc Mainnet to swap OUSD</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => switchChain?.({ chainId: 5042002 })}
                  className="text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
                  style={{ background: '#FFE082', color: '#E65100' }}
                >Arc Testnet</button>
                <button
                  onClick={() => switchChain?.({ chainId: 5042 })}
                  className="text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
                  style={{ background: '#FFE082', color: '#E65100' }}
                >Arc Mainnet</button>
              </div>
            </div>
          )}

          {/* Mainnet not deployed yet */}
          {!wrongChain && notDeployed && (
            <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#E8EEFF', border: `1px solid ${OUSD_BORDER}` }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: OUSD_BLUE }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: OUSD_BLUE }}>OUSD coming to Arc Mainnet</p>
                <p className="text-xs mt-0.5 text-gray-500">The mainnet contracts are being deployed. Switch to Arc Testnet to try OUSD now.</p>
                <button
                  onClick={() => switchChain?.({ chainId: 5042002 })}
                  className="mt-2 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors"
                  style={{ background: OUSD_BLUE, color: 'white' }}
                >Try on Testnet</button>
              </div>
            </div>
          )}

          {/* Paused */}
          {isPaused && !wrongChain && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-sm font-medium">Swaps are temporarily paused.</p>
            </div>
          )}

          {/* Balances */}
          {!wrongChain && address && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl p-3" style={{ background: '#E3F2FD' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: '#1565C0' }}>USDC Balance</p>
                <p className="text-sm font-bold" style={{ color: '#0D47A1' }}>${fmtUsdc(usdcBal)}</p>
              </div>
              <div className="rounded-2xl p-3" style={{ background: OUSD_LIGHT }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: OUSD_BLUE }}>OUSD Balance</p>
                <p className="text-sm font-bold" style={{ color: OUSD_BLUE }}>{fmtUsdc(ousdBal)} OUSD</p>
              </div>
            </div>
          )}

          {/* Direction toggle */}
          <div className="rounded-2xl p-1 flex" style={{ background: OUSD_LIGHT }}>
            {(['buy', 'sell'] as Direction[]).map(d => (
              <button
                key={d}
                onClick={() => { setDirection(d); setAmountStr(''); setStep('idle'); stepRef.current = 'idle' }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={direction === d
                  ? { background: OUSD_BLUE, color: 'white', boxShadow: '0 2px 8px rgba(13,71,209,0.3)' }
                  : { color: OUSD_BLUE }}
              >
                {d === 'buy' ? 'USDC → OUSD' : 'OUSD → USDC'}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Amount ({fromToken})</label>
              <button
                className="text-xs font-semibold"
                style={{ color: OUSD_BLUE }}
                onClick={() => setAmountStr(formatUnits(fromBal, DECIMALS))}
              >
                Max: {fmtUsdc(fromBal)}
              </button>
            </div>
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-3 transition-all"
              style={{ background: '#F8FAFF', border: `1.5px solid ${OUSD_BORDER}` }}
            >
              <span className="font-medium text-sm text-gray-400">{fromToken === 'USDC' ? '$' : ''}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent font-semibold text-lg outline-none"
                style={{ color: '#111' }}
              />
              <span className="text-sm font-bold" style={{ color: OUSD_BLUE }}>{fromToken}</span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: OUSD_LIGHT }}>
              <ChevronDown className="w-4 h-4" style={{ color: OUSD_BLUE }} />
            </div>
          </div>

          {/* Output preview */}
          <div className="rounded-2xl px-4 py-3" style={{ background: OUSD_LIGHT, border: `1px solid ${OUSD_BORDER}` }}>
            <p className="text-xs font-medium mb-1 text-gray-500">You receive ({toToken})</p>
            <p className="text-xl font-bold" style={{ color: OUSD_BLUE }}>
              {amount > 0n ? fmtUsdc(net) : '—'}
              <span className="text-sm font-normal ml-1" style={{ color: '#6B9DFC' }}>{toToken}</span>
            </p>
            {amount > 0n && (
              <p className="text-xs mt-0.5" style={{ color: '#4C7BEE' }}>
                Platform fee (1%): {fmtUsdc(fee)} USDC · max $5
              </p>
            )}
          </div>

          {/* Step progress */}
          {step !== 'idle' && step !== 'error' && (
            <div className="rounded-2xl p-4 space-y-2" style={{ background: OUSD_LIGHT, border: `1px solid ${OUSD_BORDER}` }}>
              {needsApprove && (
                <div className="flex items-center gap-2">
                  {step === 'approving' ? (
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${OUSD_BLUE} transparent transparent transparent` }} />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  <span className="text-xs font-medium" style={{ color: OUSD_BLUE }}>Approve USDC</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {step === 'swapping' || step === 'done' ? (
                  step === 'done'
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${OUSD_BLUE} transparent transparent transparent` }} />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                )}
                <span className="text-xs font-medium" style={{ color: OUSD_BLUE }}>
                  {direction === 'buy' ? 'Mint OUSD' : 'Redeem OUSD'}
                </span>
              </div>
              {step === 'done' && txHash && (
                <a
                  href={`${EXPLORER}/tx/${txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium mt-1"
                  style={{ color: OUSD_BLUE }}
                >
                  <ExternalLink className="w-3 h-3" /> View on Arc Explorer
                </a>
              )}
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-green-800 text-sm">
                {direction === 'buy' ? 'OUSD minted successfully!' : 'OUSD redeemed successfully!'}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {direction === 'buy'
                  ? `Received ${fmtUsdc(net)} OUSD for ${fmtUsdc(amount)} USDC`
                  : `Received ${fmtUsdc(net)} USDC for ${fmtUsdc(amount)} OUSD`}
              </p>
              <button
                onClick={() => { setStep('idle'); stepRef.current = 'idle'; setAmountStr('') }}
                className="mt-3 text-xs font-semibold text-green-700 bg-green-100 hover:bg-green-200 rounded-xl px-4 py-2 transition-colors"
              >
                Swap again
              </button>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold">Transaction failed</p>
              </div>
              <p className="text-xs text-red-600 break-words">{errMsg}</p>
              <button
                onClick={() => { setStep('idle'); stepRef.current = 'idle'; setErrMsg('') }}
                className="mt-3 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-xl px-4 py-2 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* About OUSD */}
          <div className="rounded-2xl p-4" style={{ background: '#F8FAFF', border: `1px solid ${OUSD_BORDER}` }}>
            <div className="flex items-center gap-2 mb-2">
              <OUSDIcon size={18} />
              <p className="text-xs font-bold" style={{ color: OUSD_BLUE }}>About OpenPay OpenUSD (OUSD)</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              OUSD is a USD-pegged utility token fully backed 1:1 by USDC. Every OUSD in circulation is matched by a USDC held in the swap contract reserve. A 1% platform fee (max $5) applies to each swap.
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {!notDeployed && (<>
                <a href={`${EXPLORER}/address/${OUSD_TOKEN}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium" style={{ color: OUSD_BLUE }}>
                  <ExternalLink className="w-3 h-3" /> OUSD Token Contract
                </a>
                <a href={`${EXPLORER}/address/${OUSD_SWAP}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium" style={{ color: OUSD_BLUE }}>
                  <ExternalLink className="w-3 h-3" /> Swap Contract
                </a>
              </>)}
            </div>
          </div>

          {/* CTA */}
          {step !== 'done' && !wrongChain && !isPaused && !notDeployed && (
            <button
              disabled={inProgress || amount === 0n || !address || (direction === 'buy' && usdcBal < amount) || (direction === 'sell' && ousdBal < amount)}
              onClick={() => void handleSwap()}
              className="w-full py-4 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
              style={{ background: OUSD_BLUE, boxShadow: `0 4px 16px rgba(13,71,209,0.35)` }}
            >
              {inProgress ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {step === 'approving' ? 'Approving…' : 'Swapping…'}
                </>
              ) : !address ? (
                'Connect Wallet'
              ) : (
                `${direction === 'buy' ? 'Mint' : 'Redeem'} ${amount > 0n ? fmtUsdc(net) + ' ' + toToken : toToken}`
              )}
            </button>
          )}

          <div className="h-2" />
        </div>
      </div>
    </div>
  )
}

export function OUSDSwapSheet({ open, onClose }: Props) {
  if (!open) return null
  return <OUSDSwapInner key={String(open)} onClose={onClose} />
}
