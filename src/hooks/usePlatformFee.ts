/**
 * Platform fee configuration.
 * 1% of every transaction amount is sent to the fee wallet.
 * Minimum fee: 0.01 USDC. Maximum fee: 5 USDC (cap per tx).
 */

export const FEE_WALLET = '0x9853332ecae783514af8d39854f4a1762e152dc9' as const

export const FEE_RATE    = 0.01   // 1%
export const FEE_MIN     = 0.01   // $0.01 USDC
export const FEE_MAX     = 5.00   // $5.00 USDC cap

/**
 * Calculate the platform fee for a given USDC amount string.
 * Returns the fee as a number rounded to 6 decimal places.
 */
export function calcPlatformFee(amountStr: string): number {
  const amount = parseFloat(amountStr)
  if (!isFinite(amount) || amount <= 0) return 0
  const fee = amount * FEE_RATE
  return Math.min(Math.max(fee, FEE_MIN), FEE_MAX)
}

/**
 * Format fee for display.
 */
export function formatFee(amountStr: string): string {
  const fee = calcPlatformFee(amountStr)
  if (fee === 0) return '$0.00 USDC'
  if (fee < 0.01) return '<$0.01 USDC'
  return `$${fee.toFixed(2)} USDC`
}
