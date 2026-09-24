/**
 * useNetworkFee — estimates the network fee for a standard ERC-20 transfer
 * on the active chain, refreshed every 12 seconds.
 *
 * On Arc, USDC is the native gas token, so fees are denominated in USDC.
 * Gas price is read via wagmi's useGasPrice; gas units for an ERC-20 transfer
 * are ~65 000 (conservative). Fee = gasPrice × gasUnits, formatted as USDC.
 *
 * Returns:
 *   feeUSDC   — formatted string e.g. "~$0.000013 USDC" or null while loading
 *   feeRaw    — raw bigint in native units
 *   isLoading
 */
import { useGasPrice } from 'wagmi'
import { useNetwork } from '@/NetworkContext'

const ERC20_TRANSFER_GAS = 65_000n   // conservative estimate
const ARC_NATIVE_DECIMALS = 18n       // Arc native (USDC-as-gas) decimals

export function useNetworkFee() {
  const { chainId } = useNetwork()

  const { data: gasPrice, isLoading } = useGasPrice({
    chainId,
    query: { refetchInterval: 12_000 },
  })

  if (!gasPrice) return { feeUSDC: null, feeRaw: null, isLoading }

  const feeRaw = gasPrice * ERC20_TRANSFER_GAS

  // Convert to human-readable USDC.  Arc uses 18 decimals for the native unit.
  const feeFloat = Number(feeRaw) / 10 ** Number(ARC_NATIVE_DECIMALS)

  // Format with enough precision to be non-zero for micro-fees
  let feeUSDC: string
  if (feeFloat === 0) {
    feeUSDC = '~$0.00 USDC'
  } else if (feeFloat < 0.000001) {
    feeUSDC = `~$${feeFloat.toExponential(2)} USDC`
  } else if (feeFloat < 0.01) {
    feeUSDC = `~$${feeFloat.toFixed(6)} USDC`
  } else {
    feeUSDC = `~$${feeFloat.toFixed(4)} USDC`
  }

  return { feeUSDC, feeRaw, isLoading }
}
