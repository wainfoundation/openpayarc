/**
 * Official Arc token registry — addresses from docs.arc.io/arc/references/contract-addresses
 * All tokens use 6 decimals on Arc (both testnet and mainnet).
 */

export interface ArcToken {
  symbol: string
  name: string
  decimals: number
  /** undefined = not yet deployed on this chain */
  address: `0x${string}` | undefined
  coingeckoId?: string
  color: string
  /** feature flag key in NetworkContext — undefined = always visible */
  featureKey?: string
}

// ─── Testnet (5042002) ────────────────────────────────────────────────────────
const TESTNET_TOKENS: ArcToken[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x3600000000000000000000000000000000000000',
    color: '#2775CA',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    color: '#0052FF',
    featureKey: 'eurc',
  },
  {
    symbol: 'USYC',
    name: 'US Yield Coin',
    decimals: 6,
    address: '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C',
    color: '#16A34A',
    featureKey: 'usyc',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle Bitcoin',
    decimals: 8,
    address: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
    color: '#F7931A',
    featureKey: 'cirbtc',
  },
  {
    symbol: 'OUSD',
    name: 'OpenPay OpenUSD',
    decimals: 6,
    address: '0xdd9cb6cbe39f5caf475241124e749875d7e7b355',
    color: '#0D47D1',
    featureKey: 'ousd',
  },
]

// ─── Mainnet (5042) ───────────────────────────────────────────────────────────
const MAINNET_TOKENS: ArcToken[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0x3600000000000000000000000000000000000000',
    color: '#2775CA',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',
    color: '#0052FF',
    featureKey: 'eurc',
  },
  {
    symbol: 'USYC',
    name: 'US Yield Coin',
    decimals: 6,
    address: '0x8a5D989Bbb96929F689B0200f435f53dA42bF490',
    color: '#16A34A',
    featureKey: 'usyc',
  },
  {
    symbol: 'cirBTC',
    name: 'Circle Bitcoin',
    decimals: 8,
    address: undefined, // not yet on Arc Mainnet
    color: '#F7931A',
    featureKey: 'cirbtc',
  },
  {
    symbol: 'OUSD',
    name: 'OpenPay OpenUSD',
    decimals: 6,
    address: undefined, // add when deployed to mainnet
    color: '#0D47D1',
    featureKey: 'ousd',
  },
]

const TOKEN_MAP: Record<number, ArcToken[]> = {
  5042002: TESTNET_TOKENS,
  5042: MAINNET_TOKENS,
}

export function getArcTokens(chainId: number): ArcToken[] {
  return TOKEN_MAP[chainId] ?? TESTNET_TOKENS
}

export function getArcToken(chainId: number, symbol: string): ArcToken | undefined {
  return getArcTokens(chainId).find(t => t.symbol === symbol)
}

/** Token icon — returns an inline SVG data URI for consistent rendering at any size */
export function tokenIconChar(symbol: string): string {
  const map: Record<string, string> = {
    USDC: '$', EURC: '€', USYC: '⬡', cirBTC: '₿', OUSD: 'O',
  }
  return map[symbol] ?? symbol[0] ?? '?'
}

export type TokenSymbol = 'USDC' | 'EURC' | 'USYC' | 'cirBTC' | 'OUSD'
