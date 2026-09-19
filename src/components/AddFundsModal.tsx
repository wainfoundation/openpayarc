/**
 * AddFundsModal — "How do you want to fund your wallet?" picker.
 * White / light mode to match the rest of the iOS-style UI.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowLeftRight, CreditCard } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import BuyFiatSheet from '@/components/BuyFiatSheet'

const springs = { modal: { type: 'spring' as const, damping: 30, stiffness: 280 } }

function ChainBadge({ letter, bg, color }: { letter: string; bg: string; color: string }) {
  return (
    <span
      className="inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: bg, color }}
    >
      {letter}
    </span>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  onBridge: () => void
}

export default function AddFundsModal({ open, onClose, onBridge }: Props) {
  const [fiatOpen, setFiatOpen] = useState(false)

  const handleBridge = () => {
    onClose()
    setTimeout(onBridge, 180)
  }

  const handleFiat = () => {
    onClose()
    setTimeout(() => setFiatOpen(true), 180)
  }

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

          {/* Card */}
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            style={{ border: '1px solid rgba(0,0,0,0.08)' }}
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={springs.modal}
            onClick={e => e.stopPropagation()}
          >
            {/* Spectral top bar */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#5fbeff,#af8ff4,#f05c6b,#ffcd83,#7ef1b3)' }} />

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute right-4 top-5 flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200"
            >
              <X className="size-4" />
            </button>

            {/* Header */}
            <div className="px-6 pb-2 pt-7 text-center">
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                How do you want to fund your wallet?
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Get your assets on Arc to earn, swap, move money, and more.
              </p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3 px-5 pb-3 pt-5">
              {/* Transfer Crypto */}
              <button
                onClick={handleBridge}
                className="group flex flex-col rounded-2xl p-4 text-left transition-all hover:shadow-md active:scale-[0.97]"
                style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
              >
                <div
                  className="mb-3 flex size-10 items-center justify-center rounded-xl"
                  style={{ background: '#dbeafe' }}
                >
                  <ArrowLeftRight className="size-5 text-blue-600" />
                </div>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Transfer your Crypto</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Move your USDC from another network to Arc.
                </p>
                <div className="mt-3 flex items-center gap-1">
                  <ChainBadge letter="E"  bg="#627EEA18" color="#627EEA" />
                  <ChainBadge letter="B"  bg="#0052FF18" color="#0052FF" />
                  <ChainBadge letter="Ar" bg="#28A0F018" color="#28A0F0" />
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-400" style={{ background: '#f1f5f9' }}>+12</span>
                </div>
              </button>

              {/* Buy with Fiat */}
              <button
                onClick={handleFiat}
                className="group flex flex-col rounded-2xl p-4 text-left transition-all hover:shadow-md active:scale-[0.97]"
                style={{ background: '#f8faff', border: '1px solid #dbeafe' }}
              >
                <div
                  className="mb-3 flex size-10 items-center justify-center rounded-xl"
                  style={{ background: '#dbeafe' }}
                >
                  <CreditCard className="size-5 text-blue-600" />
                </div>
                <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Buy using Fiat</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Buy USDC with your preferred payment method.
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="flex h-6 w-9 items-center justify-center rounded bg-white shadow-sm" style={{ border: '1px solid #e2e8f0' }}>
                    <span className="text-[9px] font-black" style={{ color: '#EB001B' }}>M</span>
                    <span className="text-[9px] font-black" style={{ color: '#F79E1B' }}>C</span>
                  </span>
                  <span className="flex h-6 w-9 items-center justify-center rounded bg-white text-[9px] font-extrabold shadow-sm" style={{ border: '1px solid #e2e8f0', color: '#1A1F71' }}>
                    VISA
                  </span>
                  <span className="flex h-6 w-9 items-center justify-center rounded bg-white text-[8px] font-bold shadow-sm" style={{ border: '1px solid #e2e8f0', color: '#1d2f50' }}>
                    ⊕Pay
                  </span>
                  <span className="flex h-6 w-9 items-center justify-center rounded bg-white text-[8px] font-bold shadow-sm" style={{ border: '1px solid #e2e8f0', color: '#4285F4' }}>
                    GPay
                  </span>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center gap-3 pb-6 pt-2">
              <div className="flex items-center gap-1.5">
                <TokenUSDC variant="branded" size={18} />
                <span className="text-xs font-semibold text-slate-400">Powered by Circle · USDC</span>
              </div>
              <button
                onClick={onClose}
                className="text-sm font-semibold text-slate-400 transition-colors hover:text-slate-700"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <BuyFiatSheet
      open={fiatOpen}
      onClose={() => setFiatOpen(false)}
      onBack={() => { setFiatOpen(false); onClose() }}
    />
    </>
  )
}
