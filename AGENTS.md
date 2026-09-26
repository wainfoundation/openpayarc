# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

OpenPay Arc — a USDC wallet app on Arc Testnet with send, receive, bridge, QR scan, and savings features.

## Deployed Contracts

| Contract | Chain | Address | Explorer |
|---|---|---|---|
| OpenPaySavings | Arc Testnet | 0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523 | https://explorer.testnet.arc.io/address/0x8da10c3181669f4895b7aeaa59bcca4f1ef2a523 |
| OpenPayCheckout | Arc Testnet | 0x4cf994d842d5a49f683f41f452cbfe7bece31007 | https://explorer.testnet.arc.io/address/0x4cf994d842d5a49f683f41f452cbfe7bece31007 |
| OpenPayOUSD (token) | Arc Testnet | 0xdd9cb6cbe39f5caf475241124e749875d7e7b355 | https://explorer.testnet.arc.io/address/0xdd9cb6cbe39f5caf475241124e749875d7e7b355 |
| OpenPayOUSDSwap | Arc Testnet | 0x5fa7eea107a26102c676b9db6eca311849cefdfd | https://explorer.testnet.arc.io/address/0x5fa7eea107a26102c676b9db6eca311849cefdfd |
| NOTE: Owner (0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9) must call setSwapContract(0x5fa7eea107a26102c676b9db6eca311849cefdfd) on the OUSD token | - | - | - |

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
