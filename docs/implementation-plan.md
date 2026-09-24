Reading both contracts in full before saying anything. I have read every contract line and confirmed all mainnet parameters from official Arc documentation. Here is the full pre-deployment report — nothing has been deployed or changed.

---

## A. Arc Mainnet Configuration (confirmed from docs.arc.io)

| Parameter | Value |
|---|---|
| Chain ID | `5042` (`0x13b2`) — confirmed by `eth_chainId` on-chain |
| RPC URL | `https://rpc.mainnet.arc.io` |
| Block explorer | `https://explorer.arc.io` (currently behind Cloudflare Access; use arcscan.org as fallback) |
| USDC ERC-20 address | `0x3600000000000000000000000000000000000000` (same as testnet — 6 decimals, confirmed on-chain) |
| Gas token | Native USDC, 18 decimals — **no faucet exists, real USDC required** |
| EVM target | Paris (same as testnet — no Cancun/Shanghai opcodes available) |
| Finality | ~500ms, instant |

---

## B. Problems Found in Current Contracts

### OpenPayOUSD.sol — 2 issues

**B1 [Medium] — Fee model violates backing invariant.**
The current `mintOUSD` flow is:
- User pays `X` USDC
- Fee `f` is taken from `X` → `pendingFees += f`
- OUSD minted = `X - f`

This means if a user pays 100 USDC they receive 99 OUSD. The swap contract holds 100 USDC but only 99 OUSD is circulating — that is technically over-backed, which is safe. However your spec requires the opposite framing: the user should get exactly 100 OUSD and pay 101 USDC (fee on top). The current model charges the fee *from* the deposited amount, not *on top of* it. If your whitepaper says "1 USDC buys 1 OUSD and the fee is extra", the contract logic must change. If the whitepaper says "1 USDC gets you 0.99 OUSD" (fee deducted from proceeds), the current contract is correct and safe but the wording in your spec is wrong.

**This is the single most important decision before mainnet deployment.**

Current model (what the code does):
```
User sends 100 USDC → 1 USDC fee → 99 OUSD minted → 99 USDC backing OUSD, 1 USDC in pendingFees
Backing ratio: 99 USDC / 99 OUSD = 1:1 ✓ (safe)
```

Your spec's required model:
```
User sends 101 USDC → 1 USDC fee → 100 OUSD minted → 100 USDC backing OUSD, 1 USDC in pendingFees
Backing ratio: 100 USDC / 100 OUSD = 1:1 ✓ (safe)
```

Both are safe (neither creates underbacked OUSD). The difference is only UX: who "pays" the fee — the depositor or the recipient.

**B2 [Low] — `setSwapContract` is one-time-only with no recovery path.** If a bug is found in the swap contract after deployment, the token can never be re-wired. This is intentional by design but must be documented as a known limitation. On mainnet, you cannot redeploy just the swap — you'd need to redeploy both contracts.

### OpenPayOUSDSwap.sol — 3 issues

**B3 [Critical] — Reserve can be drained by `claimFees` if called before full backing is confirmed.** `pendingFees` accumulates the fee portion of USDC held by the contract. The USDC held by the swap contract equals `totalSupply() + pendingFees` (the invariant). `claimFees()` sends `pendingFees` to `feeWallet`, which is correct. However there is no `require(IERC20(usdc).balanceOf(address(this)) >= pendingFees + ousd.totalSupply())` guard. If the USDC balance drops below `totalSupply()` for any reason (e.g. direct USDC transfer out via some other path — which doesn't exist today but is worth guarding), `claimFees` could drain backing. **Low risk given current code but worth adding the invariant check.**

**B4 [Low] — No reserve balance view function.** There is no `reserveBalance()` or similar view that returns `IERC20(usdc).balanceOf(address(this)) - pendingFees`, making it hard to verify the backing invariant on-chain without two separate calls.

**B5 [Low] — `renounceOwnership` reverts with a plain string, not a custom error.** Minor gas and consistency issue.

---

## C. Required Solidity Changes

### Change C1 — Fix the fee model (required if your spec means "fee on top")

If you want "user pays 101 USDC → gets 100 OUSD", `mintOUSD` needs to take `ousdAmount` (not `usdcAmount`) as input and compute:

```solidity
// User specifies how much OUSD they want
function mintOUSD(uint256 ousdAmount) external whenNotPaused {
    if (ousdAmount == 0) revert ZeroAmount();
    uint256 fee = (ousdAmount * feeBps) / 10_000;
    if (fee > feeCapUsdc) fee = feeCapUsdc;
    uint256 usdcRequired = ousdAmount + fee;   // user pays OUSD amount + fee on top

    pendingFees += fee;
    IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcRequired);
    ousd.mint(msg.sender, ousdAmount);
    emit Minted(msg.sender, usdcRequired, ousdAmount, fee);
}
```

Redemption symmetrically:
```solidity
// User burns 100 OUSD, gets 99 USDC (fee deducted from proceeds)
function redeemOUSD(uint256 ousdAmount) external whenNotPaused {
    if (ousdAmount == 0) revert ZeroAmount();
    uint256 fee = (ousdAmount * feeBps) / 10_000;
    if (fee > feeCapUsdc) fee = feeCapUsdc;
    if (fee >= ousdAmount) revert ZeroAmount();
    uint256 usdcOut = ousdAmount - fee;

    pendingFees += fee;
    ousd.burn(msg.sender, ousdAmount);
    IERC20(usdc).safeTransfer(msg.sender, usdcOut);
    emit Redeemed(msg.sender, ousdAmount, usdcOut, fee);
}
```

**If you prefer to keep the current model** (fee deducted from deposit, user gets slightly less OUSD), no code change is needed — just update your docs to reflect it.

### Change C2 — Add reserve invariant check to `claimFees` (recommended)

```solidity
function claimFees() external onlyOwner {
    uint256 amount = pendingFees;
    if (amount == 0) revert NoPendingFees();
    // Invariant: USDC held = circulating OUSD + pendingFees
    require(
        IERC20(usdc).balanceOf(address(this)) >= ousd.totalSupply() + amount,
        "reserve invariant violated"
    );
    pendingFees = 0;
    IERC20(usdc).safeTransfer(feeWallet, amount);
    emit FeesClaimed(amount);
}
```

Note: requires adding `IERC20` view on `ousd` — add `totalSupply()` to the `IOpenPayOUSD` interface.

### Change C3 — Add `reserveBalance()` view (recommended)

```solidity
function reserveBalance() external view returns (uint256) {
    return IERC20(usdc).balanceOf(address(this)) - pendingFees;
}
```

### Change C4 — Replace `renounceOwnership` string revert with custom error (minor)

```solidity
error RenounceDisabled();
function renounceOwnership() public pure override { revert RenounceDisabled(); }
```

---

## D. Required Deployment-Script Changes

The `foundry.toml` needs a mainnet RPC entry. Current file likely only has testnet. Add:

```toml
[rpc_endpoints]
arc_mainnet = "https://rpc.mainnet.arc.io"
arc_testnet = "https://rpc.testnet.arc.io"
```

The deployment commands must use `--rpc-url https://rpc.mainnet.arc.io` and `--chain-id 5042`. The USDC address (`0x3600000000000000000000000000000000000000`) is confirmed correct for mainnet — no change needed there.

---

## E. Security Risks

| Risk | Severity | Notes |
|---|---|---|
| Fee model mismatch with whitepaper | High | Decide now — see C1 |
| Single owner key controls pause, fee wallet, ownership transfer | High | Use a hardware wallet or multisig for `0x9853...` on mainnet |
| `setSwapContract` is one-time — no recovery if swap bug found | Medium | Document; deploy carefully |
| No reserve invariant guard in `claimFees` | Low | See C2 |
| explorer.arc.io is currently behind Cloudflare Access | Info | Use arcscan.org as fallback for post-deploy verification |
| Real USDC gas — deployer wallet must be funded | Operational | Fund `0x13c4E6...` with enough USDC for 3 transactions before starting |

---

## F. Exact Deployment Commands (ready to run once you say DEPLOY MAINNET)

```bash
# Prerequisites
export PRIVATE_KEY="<your-private-key-for-0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9>"
export ADMIN="0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9"
export FEE_WALLET="0x9853332ecae783514af8d39854f4a1762e152dc9"
export USDC="0x3600000000000000000000000000000000000000"
export RPC="https://rpc.mainnet.arc.io"

# STEP 1 — Deploy OUSD token
forge create contracts/OpenPayOUSD.sol:OpenPayOUSD \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY \
  --constructor-args "OpenPay OpenUSD" "OUSD" $ADMIN
# → Record: OUSD_TOKEN=<deployed address>

# STEP 2 — Deploy swap contract
forge create contracts/OpenPayOUSDSwap.sol:OpenPayOUSDSwap \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY \
  --constructor-args $USDC $OUSD_TOKEN $FEE_WALLET $ADMIN
# → Record: SWAP=<deployed address>

# STEP 3 — Wire: authorize swap as sole minter/burner
cast send $OUSD_TOKEN \
  "setSwapContract(address)" $SWAP \
  --rpc-url $RPC \
  --private-key $PRIVATE_KEY
```

---

## G. Post-Deployment Verification Commands

```bash
# Check swapContract is set correctly
cast call $OUSD_TOKEN "swapContract()(address)" --rpc-url $RPC
# Expected: $SWAP

# Check swapContractSet == true
cast call $OUSD_TOKEN "swapContractSet()(bool)" --rpc-url $RPC
# Expected: true

# Check total supply is 0
cast call $OUSD_TOKEN "totalSupply()(uint256)" --rpc-url $RPC
# Expected: 0

# Check decimals
cast call $OUSD_TOKEN "decimals()(uint8)" --rpc-url $RPC
# Expected: 6

# Check owner
cast call $OUSD_TOKEN "owner()(address)" --rpc-url $RPC
# Expected: 0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9

# Check USDC reserve in swap contract (should be 0 before first deposit)
cast call $USDC "balanceOf(address)(uint256)" $SWAP --rpc-url $RPC
# Expected: 0

# Check fee parameters
cast call $SWAP "feeBps()(uint256)" --rpc-url $RPC
# Expected: 100

cast call $SWAP "feeCapUsdc()(uint256)" --rpc-url $RPC
# Expected: 5000000

cast call $SWAP "feeWallet()(address)" --rpc-url $RPC
# Expected: 0x9853332ecae783514af8d39854f4a1762e152dc9

# Check swap contract points to correct USDC
cast call $SWAP "usdc()(address)" --rpc-url $RPC
# Expected: 0x3600000000000000000000000000000000000000

# Check swap contract points to correct OUSD token
cast call $SWAP "ousd()(address)" --rpc-url $RPC
# Expected: $OUSD_TOKEN
```

---

## H. Mainnet Testing Procedure

Before saying DEPLOY MAINNET, run the full test suite one more time on the compiled contracts:

```bash
forge test --match-path "contracts/test/OpenPayOUSD.t.sol" -vv
```

Then do a dry-run against a local fork of Arc Mainnet:

```bash
anvil --fork-url https://rpc.mainnet.arc.io --chain-id 5042
# In a separate terminal, run all deployment commands against localhost:8545
# Then run all verification commands against localhost:8545
```

This lets you confirm the USDC precompile at `0x3600...` responds correctly on mainnet state before spending real USDC on gas.

---

## I. Final Deployment Checklist

- [ ] Decide on fee model: "fee deducted from deposit" (current code, no change) or "fee on top" (requires C1 change)
- [ ] Apply changes C2 (reserve guard) and C3 (reserve view) — recommended
- [ ] Run `forge test` — all 51 tests must pass
- [ ] Fund deployer wallet `0x13c4E6e84Ac8F0443682eC9B42816EeAA2fc13B9` with real USDC for gas (3 transactions)
- [ ] Confirm `foundry.toml` has `arc_mainnet = "https://rpc.mainnet.arc.io"`
- [ ] Run anvil fork dry-run — all deployment + verification steps pass
- [ ] Never commit `PRIVATE_KEY` to git — confirm `.gitignore` includes `.env`
- [ ] Have owner wallet (`0x13c4E6...`) on a hardware wallet or equivalent for mainnet
- [ ] Say **DEPLOY MAINNET** — I will then execute step-by-step and stop after each transaction for your confirmation

---

**One question before proceeding:** Which fee model do you want?

- **Option A (current code, no change):** User sends 100 USDC → gets 99 OUSD, fee = 1 USDC. Backing: 99 USDC / 99 OUSD = 1:1.
- **Option B (spec model, requires code change):** User sends 101 USDC → gets 100 OUSD, fee = 1 USDC. Backing: 100 USDC / 100 OUSD = 1:1.

Both are safe. Option B matches your written spec more closely. Confirm which you want and I'll apply any code changes, then wait for "DEPLOY MAINNET".
