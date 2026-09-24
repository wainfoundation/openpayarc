/**
 * OUSDInfoSheet — OUSD token details + whitepaper inline sheet.
 * Covers: what is OUSD, tokenomics, how it works, smart contract addresses,
 * backing mechanism, fee model, and the full whitepaper.
 */
import { useState } from 'react'
import { useChainId } from 'wagmi'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronDown, ExternalLink, Shield, Zap, Lock, TrendingUp, BookOpen, Code2 } from 'lucide-react'
import OUSDIcon from '@/components/OUSDIcon'

// OUSD brand palette
const OU = {
  bg:     '#0D47D1',
  light:  '#E8EFFE',
  border: '#C5D5F8',
  text:   '#0D47D1',
  mid:    '#1A56E8',
  muted:  '#4C7BEE',
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const OUSD_ADDRESSES: Record<number, { token: string; swap: string; explorer: string }> = {
  5042002: {
    token:    '0xdd9cb6cbe39f5caf475241124e749875d7e7b355',
    swap:     '0x51fb1d4ca43eda173457f6c279de284a63040d13',
    explorer: 'https://explorer.testnet.arc.io',
  },
  5042: {
    token:    '0x0000000000000000000000000000000000000000',
    swap:     '0x0000000000000000000000000000000000000000',
    explorer: 'https://explorer.arc.io',
  },
}
const OUSD_SAVINGS_TESTNET = '0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</span>
        <ChevronDown className={`size-4 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-sm leading-relaxed text-slate-500">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ContractRow({ label, address, explorer }: { label: string; address: string; explorer: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => undefined)
  }
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5" style={{ border: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400">{label}</p>
        <p className="mono mt-0.5 truncate text-xs" style={{ color: 'var(--ink)' }}>{address.slice(0, 18)}…{address.slice(-6)}</p>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <button onClick={copy} className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-slate-100" style={{ color: 'var(--muted)' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer"
          className="flex size-6 items-center justify-center rounded-lg transition-colors hover:bg-slate-100">
          <ExternalLink className="size-3.5 text-slate-400" />
        </a>
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  onSwap?: () => void
}

export default function OUSDInfoSheet({ open, onClose, onSwap }: Props) {
  const [tab, setTab] = useState<'overview' | 'whitepaper'>('overview')
  const walletChainId = useChainId()
  const netAddrs = OUSD_ADDRESSES[walletChainId] ?? OUSD_ADDRESSES[5042002]
  const OUSD_TOKEN    = netAddrs.token
  const OUSD_SWAP     = netAddrs.swap
  const EXPLORER      = netAddrs.explorer
  const OUSD_SAVINGS  = OUSD_SAVINGS_TESTNET  // savings vault only on testnet for now
  const isMainnet     = walletChainId === 5042
  const deployed      = OUSD_TOKEN !== '0x0000000000000000000000000000000000000000'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '94dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-1 shrink-0" style={{ background: spectral }} />
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-10 pt-2">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <OUSDIcon size={40} />
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>OpenPay OpenUSD</h2>
                    <p className="text-xs text-slate-400">OUSD · Arc Testnet · 6 decimals</p>
                  </div>
                </div>
                <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100">
                  <X className="size-4 text-slate-400" />
                </button>
              </div>

              {/* Price badge */}
              <div className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: OU.light, border: `1px solid ${OU.border}` }}>
                <div>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: OU.text }}>$1.00 <span className="text-sm font-medium" style={{ color: OU.muted }}>USD</span></p>
                  <p className="mt-0.5 text-xs" style={{ color: OU.muted }}>Pegged 1:1 to USD · Backed by USDC</p>
                </div>
                <div className="ml-auto flex flex-col gap-1 text-right">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>Stable</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: OU.light, color: OU.text }}>ERC-20</span>
                </div>
              </div>

              {/* Quick stats */}
              <div className="mb-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Peg', value: '$1.00', icon: <TrendingUp className="size-3.5" /> },
                  { label: 'Backing', value: '100%', icon: <Shield className="size-3.5" /> },
                  { label: 'Swap fee', value: '1%', icon: <Zap className="size-3.5" /> },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center rounded-xl bg-slate-50 py-3" style={{ border: '1px solid var(--border)' }}>
                    <span className="mb-1 text-slate-400">{s.icon}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{s.value}</span>
                    <span className="text-[10px] text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {onSwap && (
                <button
                  onClick={() => { onClose(); setTimeout(onSwap, 220) }}
                  className="mb-4 w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: OU.bg }}
                >
                  Swap USDC ↔ OUSD
                </button>
              )}

              {/* Tab bar */}
              <div className="mb-4 flex rounded-2xl bg-slate-100 p-1">
                {(['overview', 'whitepaper'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className="flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all"
                    style={tab === t
                      ? { background: 'white', color: OU.text, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                      : { color: 'var(--muted)' }}>
                    {t === 'whitepaper' ? <span className="flex items-center justify-center gap-1"><BookOpen className="size-3.5" />Whitepaper</span> : 'Overview'}
                  </button>
                ))}
              </div>

              {/* ── Overview tab ── */}
              {tab === 'overview' && (
                <div className="space-y-3">
                  <Section title="What is OUSD?">
                    <p>OpenPay OpenUSD (OUSD) is a USD-pegged utility token issued by the OpenPay / MrWain Foundation on the Arc blockchain. It is designed to provide a stable, low-cost medium of exchange within the OpenPay ecosystem.</p>
                    <p className="mt-2">OUSD is minted 1:1 when a user deposits USDC into the OpenPayOUSDSwap contract, and burned 1:1 when redeemed for USDC. Every OUSD in circulation is fully backed by USDC held in the swap contract — there is no fractional reserve.</p>
                  </Section>

                  <Section title="How to get OUSD">
                    <ol className="list-decimal space-y-1.5 pl-4">
                      <li>Connect your wallet to OpenPay Arc on Arc Testnet.</li>
                      <li>Tap <strong>OUSD</strong> in the quick actions or More tab.</li>
                      <li>Select <strong>Buy OUSD</strong>, enter the USDC amount, approve, and confirm.</li>
                      <li>A 1% platform fee (max $5 USDC) is deducted; the remainder is minted as OUSD to your wallet.</li>
                      <li>To redeem, select <strong>Sell OUSD</strong> — OUSD is burned and USDC is returned minus the same fee.</li>
                    </ol>
                  </Section>

                  <Section title="Backing & Reserve Invariant">
                    <p>The smart contract enforces a strict reserve invariant at all times:</p>
                    <div className="mt-2 rounded-xl px-3 py-2.5 font-mono text-xs" style={{ background: OU.light, color: OU.text }}>
                      USDC.balanceOf(swap) == OUSD.totalSupply() + pendingFees
                    </div>
                    <p className="mt-2">This means every OUSD token in circulation is backed by an equal number of USDC units in the swap contract. Platform fees accumulate separately and are claimed by the protocol owner via <code className="text-xs">claimFees()</code>, never pushing funds mid-transaction.</p>
                  </Section>

                  <Section title="Fee Model">
                    <div className="space-y-2">
                      {[
                        { label: 'Swap fee', value: '1% of swap amount' },
                        { label: 'Maximum fee', value: '$5.00 USDC per swap' },
                        { label: 'Minimum fee', value: '$0.00 (no floor — tiny swaps pay proportional)' },
                        { label: 'Fee destination', value: 'Accrued in pendingFees, claimed to fee wallet by protocol owner' },
                        { label: 'Fee token', value: 'Always USDC (even when swapping OUSD→USDC)' },
                      ].map(r => (
                        <div key={r.label} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2" style={{ border: '1px solid var(--border)' }}>
                          <span className="text-xs font-semibold text-slate-400">{r.label}</span>
                          <span className="text-right text-xs font-semibold" style={{ color: 'var(--ink)' }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section title={`Smart Contracts (Arc ${isMainnet ? 'Mainnet' : 'Testnet'})`}>
                    <div className="space-y-2">
                      {!deployed && isMainnet ? (
                        <div className="rounded-xl px-3 py-2.5 text-center text-xs font-semibold" style={{ background: '#EEF2FF', color: '#0D47D1' }}>
                          OUSD contracts coming to Arc Mainnet soon
                        </div>
                      ) : (
                        <>
                          <ContractRow label="OUSD Token (ERC-20)" address={OUSD_TOKEN} explorer={EXPLORER} />
                          <ContractRow label="OUSD Swap Contract" address={OUSD_SWAP} explorer={EXPLORER} />
                          {!isMainnet && <ContractRow label="OpenPay Savings Vault" address={OUSD_SAVINGS} explorer={EXPLORER} />}
                        </>
                      )}
                    </div>
                    <p className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                      <Code2 className="size-3.5" />
                      Contracts are non-upgradeable, verified on Arc Testnet.
                    </p>
                  </Section>

                  <Section title="Security">
                    <div className="space-y-2">
                      {[
                        { icon: <Shield className="size-3.5 text-green-600" />, label: 'Non-upgradeable', desc: 'No proxy pattern. Logic is immutable at deployment.' },
                        { icon: <Lock className="size-3.5 text-blue-600" />, label: 'One-time minter', desc: 'setSwapContract() is a one-shot function — cannot be called twice.' },
                        { icon: <Zap className="size-3.5" style={{ color: '#0D47D1' }} />, label: 'CEI pattern', desc: 'All state updates precede external token calls (reentrancy-safe).' },
                        { icon: <TrendingUp className="size-3.5 text-orange-500" />, label: 'Fee accrual (not push)', desc: 'Fees never block a swap — they accumulate and are swept separately.' },
                        { icon: <Shield className="size-3.5 text-red-500" />, label: 'Pausable', desc: 'Owner can pause the swap contract in an emergency.' },
                      ].map(s => (
                        <div key={s.label} className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5" style={{ border: '1px solid var(--border)' }}>
                          <span className="mt-0.5 shrink-0">{s.icon}</span>
                          <div>
                            <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{s.label}</p>
                            <p className="text-xs text-slate-400">{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>
              )}

              {/* ── Whitepaper tab ── */}
              {tab === 'whitepaper' && (
                <div className="space-y-4 text-sm leading-relaxed text-slate-600">
                  <div className="rounded-2xl px-5 py-4" style={{ background: `linear-gradient(135deg,${OU.light},#d0dcf9)`, border: `1px solid ${OU.border}` }}>
                    <div className="mb-3 flex items-center gap-3">
                      <OUSDIcon size={44} />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: OU.muted }}>Whitepaper v1.0 · September 2026</p>
                        <h3 className="mt-0.5 text-xl font-black" style={{ color: OU.bg }}>OpenPay OpenUSD (OUSD)</h3>
                      </div>
                    </div>
                    <p className="text-xs" style={{ color: OU.mid }}>A Fully-Backed USD-Pegged Utility Token on Arc</p>
                    <p className="mt-1 text-xs" style={{ color: OU.muted }}>Issued by the MrWain Foundation · OpenPay Arc</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>1. Abstract</h4>
                      <p>OpenPay OpenUSD (OUSD) is a fully-collateralised, USD-pegged ERC-20 token deployed on the Arc blockchain. It is designed to serve as a stable medium of exchange within the OpenPay ecosystem — enabling merchants, users, and protocol participants to transact in a token that maintains 1:1 USD parity without exposure to crypto price volatility.</p>
                      <p className="mt-2">Unlike algorithmic stablecoins, OUSD carries no protocol risk from reflexive supply mechanisms. Every unit of OUSD in circulation is backed by an equal unit of USDC held in a publicly-auditable smart contract, providing transparent, on-chain proof of reserves at all times.</p>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>2. Motivation</h4>
                      <p>Arc's native gas token is USDC, making it uniquely positioned for stablecoin-first applications. However, many payment and eCommerce use cases benefit from a distinct utility token that:</p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                        <li>Is denominated in USD but distinct from Circle's USDC, enabling platform-specific yield, rewards, and governance in the future</li>
                        <li>Can be issued and managed by the OpenPay protocol with governance controls</li>
                        <li>Integrates natively with the OpenPaySavings vault and OpenPayCheckout eCommerce contract</li>
                        <li>Provides a foundation for future features: OUSD yield, merchant rewards, loyalty points, and cross-chain issuance</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>3. Architecture</h4>
                      <p>The OUSD system consists of two smart contracts:</p>
                      <div className="mt-2 space-y-2">
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5" style={{ border: '1px solid var(--border)' }}>
                          <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>OpenPayOUSD.sol — ERC-20 Token</p>
                          <p className="mt-0.5 text-xs text-slate-400">The token contract. Implements standard ERC-20 with 6 decimals. Mint and burn functions are restricted to the registered swap contract address (set once via <code>setSwapContract()</code>, non-changeable after). Ownership follows the Ownable2Step pattern — two-step transfer prevents accidental loss of control.</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5" style={{ border: '1px solid var(--border)' }}>
                          <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>OpenPayOUSDSwap.sol — Swap & Issuance</p>
                          <p className="mt-0.5 text-xs text-slate-400">Accepts USDC deposits, mints OUSD to the user minus a 1% fee (capped at $5 USDC). Accepts OUSD burns, returns USDC to the user minus the same fee. Fees accrue in <code>pendingFees</code> and are claimed by the owner via <code>claimFees()</code>. The contract is pausable for emergency response.</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>4. Reserve Invariant</h4>
                      <p>At all times, the following invariant holds:</p>
                      <div className="my-2 rounded-xl px-3 py-2.5 font-mono text-xs" style={{ background: OU.light, color: OU.text }}>
                        USDC.balanceOf(swapContract)<br />
                        == OUSD.totalSupply() + pendingFees
                      </div>
                      <p>This can be verified on-chain at any time. The invariant holds because:</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs">
                        <li><strong>Mint path:</strong> usdcIn is deposited → fee goes to pendingFees, ousdMinted = usdcIn − fee is minted</li>
                        <li><strong>Redeem path:</strong> ousdIn is burned → fee goes to pendingFees, usdcOut = ousdIn − fee is returned</li>
                        <li><strong>Claim path:</strong> pendingFees is transferred to feeWallet → OUSD.totalSupply() is unchanged, pendingFees resets to 0</li>
                      </ul>
                      <p className="mt-2">No path can inflate OUSD supply beyond the locked USDC reserve.</p>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>5. Security Design</h4>
                      <p>The contracts were written with the following security principles:</p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs">
                        <li><strong>Checks-Effects-Interactions (CEI):</strong> All state changes (pendingFees, requestPaidFull, etc.) precede all external token calls to prevent reentrancy.</li>
                        <li><strong>No upgradability:</strong> There is no proxy pattern. Once deployed, logic cannot be changed. Users can verify behaviour directly from the source.</li>
                        <li><strong>Immutable fee parameters:</strong> feeBps (100) and feeCapUsdc (5,000,000) are immutable — the protocol cannot silently raise fees post-deployment.</li>
                        <li><strong>Fee accrual, not push:</strong> Platform fees are never pushed to feeWallet inside a user transaction. They accumulate in pendingFees and are swept by the owner separately, eliminating blocklist-based denial-of-service attacks.</li>
                        <li><strong>renounceOwnership disabled:</strong> The owner cannot accidentally abandon the contract, which would permanently brick fee collection and the pause mechanism.</li>
                        <li><strong>Constructor validation:</strong> code.length checks on usdc_ and ousd_ ensure misconfigured addresses (EOAs, wrong chain) are caught at deploy time rather than silently failing later.</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>6. Tokenomics</h4>
                      <div className="mt-2 space-y-2">
                        {[
                          { k: 'Initial supply', v: '0 — minted only on USDC deposit' },
                          { k: 'Maximum supply', v: 'Uncapped (bounded only by USDC reserve)' },
                          { k: 'Decimals', v: '6 (same as USDC on Arc)' },
                          { k: 'Mint authority', v: 'OpenPayOUSDSwap contract only (set once)' },
                          { k: 'Burn authority', v: 'OpenPayOUSDSwap contract only' },
                          { k: 'Swap fee', v: '1% per swap, capped at $5 USDC (immutable)' },
                          { k: 'Fee beneficiary', v: '0x9853332ecae783514af8d39854f4a1762e152dc9' },
                        ].map(r => (
                          <div key={r.k} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2" style={{ border: '1px solid var(--border)' }}>
                            <span className="shrink-0 text-xs font-semibold text-slate-400">{r.k}</span>
                            <span className="text-right text-xs font-medium" style={{ color: 'var(--ink)' }}>{r.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>7. Use Cases</h4>
                      <ul className="list-disc space-y-1.5 pl-4 text-xs">
                        <li><strong>OpenPay Wallet:</strong> Send, receive, and display OUSD alongside USDC in the same wallet interface.</li>
                        <li><strong>eCommerce Checkout:</strong> Merchants accepting OpenPayCheckout payment requests can denominate amounts in OUSD.</li>
                        <li><strong>Savings Vault:</strong> OUSD is designed for future integration with OpenPaySavings for yield generation.</li>
                        <li><strong>Payment Links:</strong> QR codes and payment links can specify OUSD as the payment token.</li>
                        <li><strong>Merchant Rewards:</strong> Future plans include OUSD-denominated cashback and loyalty programmes for OpenPay merchants.</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>8. Risks & Disclaimers</h4>
                      <div className="rounded-xl bg-amber-50 px-3 py-2.5" style={{ border: '1px solid #fde68a' }}>
                        <p className="text-xs text-amber-700">OUSD is currently deployed on Arc Testnet only. Testnet tokens have no monetary value. This whitepaper describes the intended design; mainnet deployment requires additional auditing, legal review, and regulatory assessment. OUSD is a utility token and not a security. This document is not financial or investment advice.</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>9. Roadmap</h4>
                      <div className="space-y-2">
                        {[
                          { phase: 'Phase 1 — Testnet', status: 'live', items: ['OUSD token + swap contract', 'Wallet integration (send/receive/balance)', 'OUSDSwapSheet UI', 'Security review + unit tests'] },
                          { phase: 'Phase 2 — Mainnet', status: 'planned', items: ['Independent security audit', 'Mainnet deployment on Arc', 'OpenPayCheckout OUSD support', 'OpenPaySavings OUSD integration'] },
                          { phase: 'Phase 3 — Ecosystem', status: 'future', items: ['OUSD yield programme', 'Merchant cashback in OUSD', 'Cross-chain bridge (CCTP)', 'Governance token integration'] },
                        ].map(p => (
                          <div key={p.phase} className="rounded-xl bg-slate-50 px-3 py-2.5" style={{ border: '1px solid var(--border)' }}>
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{p.phase}</p>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                p.status === 'live' ? 'bg-green-100 text-green-700' :
                                p.status === 'planned' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-200 text-slate-500'
                              }`}>{p.status}</span>
                            </div>
                            <ul className="mt-1.5 space-y-0.5">
                              {p.items.map(i => <li key={i} className="text-xs text-slate-400">· {i}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-center text-[10px] text-slate-300">OpenPay OpenUSD Whitepaper v1.0 · © 2026 MrWain Foundation · All rights reserved</p>
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
