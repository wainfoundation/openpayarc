import { Home, Inbox, ScanQrCode, Receipt, User } from 'lucide-react'

export type NavTab = 'home' | 'inbox' | 'qr' | 'transactions' | 'profile'

interface Props {
  active: NavTab
  onTab: (tab: NavTab) => void
  onQR: () => void
  inboxCount?: number
}

export default function BottomNav({ active, onTab, onQR, inboxCount = 0 }: Props) {
  const item = (tab: NavTab, icon: React.ReactNode, label: string) => {
    const isActive = active === tab
    return (
      <button
        key={tab}
        onClick={() => onTab(tab)}
        className="flex flex-1 flex-col items-center justify-end gap-1 pb-2 pt-3"
        style={{ color: isActive ? '#2563eb' : '#94a3b8' }}
      >
        <div className="relative">
          {icon}
          {tab === 'inbox' && inboxCount > 0 && (
            <span
              className="absolute -right-2 -top-1.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: '#ef4444' }}
            >
              {inboxCount > 9 ? '9+' : inboxCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold">{label}</span>
      </button>
    )
  }

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[480px] -translate-x-1/2 items-end"
      style={{
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {item('home', <Home className="size-5" />, 'Home')}
      {item('inbox', <Inbox className="size-5" />, 'Inbox')}

      {/* Floating QR centre button */}
      <div className="flex flex-1 flex-col items-center pb-2 pt-1">
        <button
          onClick={onQR}
          className="-mt-7 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ background: '#1d2f50' }}
          aria-label="QR"
        >
          <ScanQrCode className="size-6 text-white" />
        </button>
        <span className="mt-1 text-[10px] font-semibold" style={{ color: '#94a3b8' }}>QR</span>
      </div>

      {item('transactions', <Receipt className="size-5" />, 'Transactions')}
      {item('profile', <User className="size-5" />, 'Profile')}
    </nav>
  )
}
