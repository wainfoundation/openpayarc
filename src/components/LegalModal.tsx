import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Shield } from 'lucide-react'

// ─── Shared sheet wrapper ────────────────────────────────────────────────────

function LegalSheet({
  open, onClose, title, icon, children, onAccept, acceptLabel,
}: {
  open: boolean
  onClose: () => void
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  onAccept?: () => void
  acceptLabel?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="legal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40" style={{ backdropFilter: 'blur(4px)' }} onClick={onClose} />
          <motion.div
            key="legal-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col overflow-hidden rounded-t-3xl bg-white"
            style={{ maxHeight: '90dvh', boxShadow: '0 -8px 40px rgba(0,0,0,0.14)' }}
          >
            {/* Spectral strip */}
            <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  {icon}
                </div>
                <h2 className="text-base font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200">
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 text-sm leading-relaxed text-slate-600" style={{ WebkitOverflowScrolling: 'touch' }}>
              {children}
            </div>

            {/* Accept / Close */}
            <div className="shrink-0 border-t px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              {onAccept ? (
                <button onClick={onAccept}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'var(--accent)' }}>
                  {acceptLabel ?? 'I Accept'}
                </button>
              ) : (
                <button onClick={onClose}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: '#eff6ff', color: '#2563eb' }}>
                  Close
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Section helper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-1.5 text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</p>
      {children}
    </div>
  )
}

// ─── Terms of Service ────────────────────────────────────────────────────────

export function TermsModal({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept?: () => void }) {
  return (
    <LegalSheet open={open} onClose={onClose} title="Terms of Service" icon={<FileText className="size-4" />} onAccept={onAccept} acceptLabel="I Accept Terms">
      <p className="text-xs text-slate-400">Last updated: September 2026</p>

      <Section title="1. Acceptance of Terms">
        <p>By accessing or using OpenPay Arc ("the App"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using the App.</p>
      </Section>

      <Section title="2. Description of Service">
        <p>OpenPay Arc is a non-custodial USDC wallet application built on the Arc blockchain network, powered by Circle's USDC stablecoin. The App allows you to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Send and receive USDC on Arc Testnet and Arc Mainnet</li>
          <li>Bridge USDC from other EVM-compatible networks to Arc</li>
          <li>Swap tokens using integrated decentralised exchange aggregators</li>
          <li>Participate in savings pools via smart contracts</li>
          <li>Purchase USDC using fiat payment methods via third-party providers</li>
        </ul>
      </Section>

      <Section title="3. Non-Custodial Wallet">
        <p>OpenPay Arc is a non-custodial wallet. We do not hold, store, or control your private keys, seed phrases, or funds. You are solely responsible for the security of your wallet credentials. Lost keys cannot be recovered by us.</p>
      </Section>

      <Section title="4. Transactions Are Irreversible">
        <p>Blockchain transactions, once submitted and confirmed, are final and irreversible. You bear full responsibility for verifying recipient addresses, amounts, and network selection before confirming any transaction. Mistakes cannot be undone by us.</p>
      </Section>

      <Section title="5. Mainnet Use and Real Funds">
        <p>When operating on Arc Mainnet, you are transacting with real USDC that has real monetary value. Arc Testnet transactions use test tokens with no monetary value. Always confirm which network is active before sending.</p>
      </Section>

      <Section title="6. Third-Party Services">
        <p>The App integrates with third-party services including Circle, LiFi, PayPal, and blockchain RPC providers. We are not responsible for the actions, availability, or terms of these third parties. Your use of their services is governed by their respective terms.</p>
      </Section>

      <Section title="7. Smart Contract Risk">
        <p>The savings vault and other onchain features use smart contracts that, despite auditing, may contain bugs or vulnerabilities. You acknowledge and accept these technical risks.</p>
      </Section>

      <Section title="8. Prohibited Uses">
        <p>You agree not to use OpenPay Arc for:</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Money laundering, terrorist financing, or other illegal financial activities</li>
          <li>Sanctions violations or transactions with sanctioned parties</li>
          <li>Any use that violates applicable laws in your jurisdiction</li>
        </ul>
      </Section>

      <Section title="9. Disclaimer of Warranties">
        <p>The App is provided "AS IS" without warranty of any kind. We do not guarantee the App will be error-free, uninterrupted, or that any defects will be corrected. Use at your own risk.</p>
      </Section>

      <Section title="10. Limitation of Liability">
        <p>To the maximum extent permitted by law, OpenPay Arc and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App, including but not limited to loss of funds.</p>
      </Section>

      <Section title="11. Changes to Terms">
        <p>We reserve the right to modify these terms at any time. Continued use of the App after changes constitutes acceptance of the new terms.</p>
      </Section>

      <Section title="12. Contact">
        <p>For questions about these terms, contact us at support@openpay.arc.</p>
      </Section>
    </LegalSheet>
  )
}

// ─── Privacy Policy ──────────────────────────────────────────────────────────

export function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <LegalSheet open={open} onClose={onClose} title="Privacy Policy" icon={<Shield className="size-4" />}>
      <p className="text-xs text-slate-400">Last updated: September 2026</p>

      <Section title="1. Introduction">
        <p>OpenPay Arc ("we", "our") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information.</p>
      </Section>

      <Section title="2. Information We Collect">
        <p><strong>Blockchain Data (Public):</strong> All blockchain transactions are public by nature. Wallet addresses, transaction amounts, and timestamps are permanently recorded on the Arc blockchain and are visible to anyone.</p>
        <p className="mt-2"><strong>Local Storage Data:</strong> We store your network preference (testnet/mainnet) and terms acceptance status locally in your browser. This data never leaves your device.</p>
        <p className="mt-2"><strong>No Account Registration:</strong> We do not require you to create an account, provide an email address, or supply any personally identifying information to use the core wallet features.</p>
      </Section>

      <Section title="3. Third-Party Services">
        <p><strong>Circle:</strong> USDC is issued by Circle Internet Group. Circle's privacy practices govern your interactions with USDC infrastructure. See circle.com/privacy.</p>
        <p className="mt-2"><strong>PayPal / Fiat Purchases:</strong> When you use the "Buy using Fiat" feature, your transaction is processed by PayPal. PayPal collects and processes payment information per their privacy policy at paypal.com/privacy.</p>
        <p className="mt-2"><strong>LiFi:</strong> Token swaps and bridges use LiFi's routing aggregator. LiFi may collect analytics data per their privacy policy.</p>
        <p className="mt-2"><strong>RPC Providers:</strong> Blockchain RPC calls may be routed through Circle's infrastructure or public endpoints. These providers may log IP addresses and request metadata.</p>
      </Section>

      <Section title="4. How We Use Information">
        <p>We use locally stored preferences solely to maintain your settings across sessions. We do not:</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Sell your data to third parties</li>
          <li>Build advertising profiles</li>
          <li>Track you across other websites or apps</li>
          <li>Store your private keys or seed phrases</li>
        </ul>
      </Section>

      <Section title="5. Cookies and Tracking">
        <p>The App uses localStorage and sessionStorage for state persistence. We do not use tracking cookies or analytics SDKs beyond what third-party payment and blockchain services may use.</p>
      </Section>

      <Section title="6. Data Security">
        <p>Your wallet keys never touch our servers — all signing happens in your browser or wallet extension. We use HTTPS for all network communication. However, no system is perfectly secure; use strong device security practices.</p>
      </Section>

      <Section title="7. Your Rights">
        <p>Depending on your jurisdiction, you may have rights to access, rectify, or delete personal data we hold. Since we store minimal data and nothing server-side from core wallet use, most requests can be resolved by clearing your browser's localStorage.</p>
      </Section>

      <Section title="8. Children">
        <p>OpenPay Arc is not directed at children under 18. Do not use this App if you are under 18 years of age.</p>
      </Section>

      <Section title="9. International Transfers">
        <p>Blockchain transactions are global and decentralised. By transacting, you acknowledge that transaction data is accessible worldwide.</p>
      </Section>

      <Section title="10. Changes to This Policy">
        <p>We may update this policy from time to time. Material changes will be highlighted in the App.</p>
      </Section>

      <Section title="11. Contact">
        <p>Privacy questions: privacy@openpay.arc</p>
      </Section>
    </LegalSheet>
  )
}

// ─── First-run gate ──────────────────────────────────────────────────────────

const TERMS_KEY = 'openpay_terms_v1'

export function useTermsAccepted() {
  const accepted = localStorage.getItem(TERMS_KEY) === 'true'
  const accept = () => localStorage.setItem(TERMS_KEY, 'true')
  return { accepted, accept }
}
