// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {OpenPayOUSD} from "../OpenPayOUSD.sol";
import {OpenPayOUSDSwap} from "../OpenPayOUSDSwap.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture helper
// ─────────────────────────────────────────────────────────────────────────────

contract BaseTest is Test {
    // Actors
    address internal owner    = makeAddr("owner");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal feeWallet = makeAddr("feeWallet");

    // Contracts
    MockERC20        internal usdc;
    OpenPayOUSD      internal ousd;
    OpenPayOUSDSwap  internal swap;

    function setUp() public virtual {
        // 1. Deploy mock USDC (6 decimals, like real USDC)
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // 2. Deploy OUSD token (owner is the test owner)
        ousd = new OpenPayOUSD("OpenPay OpenUSD", "OUSD", owner);

        // 3. Deploy swap — constructor checks code.length > 0 for both tokens
        //    At this point ousd already has code, usdc too.
        vm.prank(owner);
        swap = new OpenPayOUSDSwap(address(usdc), address(ousd), feeWallet, owner);

        // 4. Wire: tell the OUSD token which swap is allowed to mint/burn
        vm.prank(owner);
        ousd.setSwapContract(address(swap));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// Seed alice with USDC and approve the swap to spend it.
    function _seedAndApproveAlice(uint256 amount) internal {
        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(swap), amount);
    }

    /// Do a full mintOUSD so swap holds USDC and alice holds OUSD.
    function _mintForAlice(uint256 usdcAmount) internal returns (uint256 ousdOut, uint256 fee) {
        _seedAndApproveAlice(usdcAmount);
        (fee, ousdOut) = swap.computeFee(usdcAmount);
        vm.prank(alice);
        swap.mintOUSD(usdcAmount);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token tests
// ─────────────────────────────────────────────────────────────────────────────

contract OpenPayOUSDTokenTest is BaseTest {

    // ── Deployment ───────────────────────────────────────────────────────────

    function test_TokenDeployment_NameSymbolDecimals() public view {
        assertEq(ousd.name(),     "OpenPay OpenUSD");
        assertEq(ousd.symbol(),   "OUSD");
        assertEq(ousd.decimals(), 6);
    }

    function test_TokenDeployment_OwnerSet() public view {
        assertEq(ousd.owner(), owner);
    }

    function test_TokenDeployment_ZeroAddressOwnerReverts() public {
        vm.expectRevert(OpenPayOUSD.ZeroAddress.selector);
        new OpenPayOUSD("OpenPay OpenUSD", "OUSD", address(0));
    }

    // ── setSwapContract ───────────────────────────────────────────────────────

    function test_SetSwapContract_HappyPath() public {
        // Deploy a fresh token with no swap set yet
        OpenPayOUSD freshToken = new OpenPayOUSD("OpenPay OpenUSD", "OUSD", owner);
        address fakeSwap = makeAddr("fakeSwap");

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(freshToken));
        emit OpenPayOUSD.SwapContractSet(fakeSwap);
        freshToken.setSwapContract(fakeSwap);

        assertEq(freshToken.swapContract(), fakeSwap);
        assertTrue(freshToken.swapContractSet());
    }

    function test_SetSwapContract_RevertsIfCalledTwice() public {
        // swap is already set in setUp()
        vm.prank(owner);
        vm.expectRevert(OpenPayOUSD.SwapContractAlreadySet.selector);
        ousd.setSwapContract(makeAddr("anotherSwap"));
    }

    function test_SetSwapContract_RevertsIfNotOwner() public {
        OpenPayOUSD freshToken = new OpenPayOUSD("OpenPay OpenUSD", "OUSD", owner);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        freshToken.setSwapContract(makeAddr("anySwap"));
    }

    function test_SetSwapContract_RevertsOnZeroAddress() public {
        OpenPayOUSD freshToken = new OpenPayOUSD("OpenPay OpenUSD", "OUSD", owner);
        vm.prank(owner);
        vm.expectRevert(OpenPayOUSD.ZeroAddress.selector);
        freshToken.setSwapContract(address(0));
    }

    // ── mint ──────────────────────────────────────────────────────────────────

    function test_Mint_HappyPath_FromSwapContract() public {
        uint256 amount = 1_000e6;

        // Only the swap contract can call mint; impersonate it
        vm.prank(address(swap));
        ousd.mint(alice, amount);

        assertEq(ousd.balanceOf(alice), amount);
        assertEq(ousd.totalSupply(),    amount);
    }

    function test_Mint_RevertsFromNonSwap() public {
        vm.prank(alice);
        vm.expectRevert(OpenPayOUSD.NotSwapContract.selector);
        ousd.mint(alice, 1_000e6);
    }

    function test_Mint_RevertsOnZeroAddress() public {
        vm.prank(address(swap));
        vm.expectRevert(OpenPayOUSD.ZeroAddress.selector);
        ousd.mint(address(0), 1_000e6);
    }

    function test_Mint_RevertsOnZeroAmount() public {
        vm.prank(address(swap));
        vm.expectRevert(OpenPayOUSD.ZeroAmount.selector);
        ousd.mint(alice, 0);
    }

    // ── burn ──────────────────────────────────────────────────────────────────

    function test_Burn_HappyPath_FromSwapContract() public {
        uint256 amount = 500e6;

        // First mint some tokens to alice
        vm.prank(address(swap));
        ousd.mint(alice, amount);

        // Now burn them
        vm.prank(address(swap));
        ousd.burn(alice, amount);

        assertEq(ousd.balanceOf(alice), 0);
        assertEq(ousd.totalSupply(),    0);
    }

    function test_Burn_RevertsFromNonSwap() public {
        vm.prank(address(swap));
        ousd.mint(alice, 1_000e6);

        vm.prank(alice);
        vm.expectRevert(OpenPayOUSD.NotSwapContract.selector);
        ousd.burn(alice, 1_000e6);
    }

    function test_Burn_RevertsOnZeroAddress() public {
        vm.prank(address(swap));
        vm.expectRevert(OpenPayOUSD.ZeroAddress.selector);
        ousd.burn(address(0), 1_000e6);
    }

    function test_Burn_RevertsOnZeroAmount() public {
        vm.prank(address(swap));
        vm.expectRevert(OpenPayOUSD.ZeroAmount.selector);
        ousd.burn(alice, 0);
    }

    // ── decimals ──────────────────────────────────────────────────────────────

    function test_Decimals_ReturnsSix() public view {
        assertEq(ousd.decimals(), 6);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swap tests
// ─────────────────────────────────────────────────────────────────────────────

contract OpenPayOUSDSwapTest is BaseTest {

    uint256 internal constant FEE_BPS     = 100;
    uint256 internal constant FEE_CAP     = 5_000_000;
    uint256 internal constant ONE_USDC    = 1_000_000;   // 1 USDC (6 dec)

    // ── Deployment ───────────────────────────────────────────────────────────

    function test_SwapDeployment_ImmutablesSet() public view {
        assertEq(swap.feeBps(),     FEE_BPS);
        assertEq(swap.feeCapUsdc(), FEE_CAP);
        assertEq(swap.feeWallet(),  feeWallet);
        assertEq(swap.owner(),      owner);
        assertEq(address(swap.usdc()), address(usdc));
        assertEq(address(swap.ousd()), address(ousd));
    }

    function test_SwapDeployment_ZeroAddressUsdcReverts() public {
        vm.expectRevert(OpenPayOUSDSwap.ZeroAddress.selector);
        new OpenPayOUSDSwap(address(0), address(ousd), feeWallet, owner);
    }

    function test_SwapDeployment_ZeroAddressOusdReverts() public {
        vm.expectRevert(OpenPayOUSDSwap.ZeroAddress.selector);
        new OpenPayOUSDSwap(address(usdc), address(0), feeWallet, owner);
    }

    function test_SwapDeployment_ZeroAddressFeeWalletReverts() public {
        vm.expectRevert(OpenPayOUSDSwap.ZeroAddress.selector);
        new OpenPayOUSDSwap(address(usdc), address(ousd), address(0), owner);
    }

    function test_SwapDeployment_UsdcNotContractReverts() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(bytes("usdc not a contract"));
        new OpenPayOUSDSwap(eoa, address(ousd), feeWallet, owner);
    }

    function test_SwapDeployment_OusdNotContractReverts() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(bytes("ousd not a contract"));
        new OpenPayOUSDSwap(address(usdc), eoa, feeWallet, owner);
    }

    // ── computeFee ────────────────────────────────────────────────────────────

    function test_ComputeFee_NormalAmount() public view {
        // 1_000_000 * 100 / 10000 = 10_000; net = 990_000
        (uint256 fee, uint256 net) = swap.computeFee(1_000_000);
        assertEq(fee, 10_000);
        assertEq(net, 990_000);
    }

    function test_ComputeFee_CappedAmount() public view {
        // 600_000_000 * 100 / 10000 = 6_000_000 > 5_000_000 → capped
        (uint256 fee, uint256 net) = swap.computeFee(600_000_000);
        assertEq(fee, FEE_CAP);         // 5_000_000
        assertEq(net, 595_000_000);
    }

    function test_ComputeFee_ZeroReverts() public {
        vm.expectRevert(OpenPayOUSDSwap.ZeroAmount.selector);
        swap.computeFee(0);
    }

    // ── mintOUSD ──────────────────────────────────────────────────────────────

    function test_MintOUSD_HappyPath() public {
        uint256 usdcAmount = 100 * ONE_USDC; // 100 USDC — fee = 1_000_000, well below cap
        uint256 expectedFee = (usdcAmount * FEE_BPS) / 10_000; // 1_000_000
        uint256 expectedOUSD = usdcAmount - expectedFee;         // 99_000_000

        _seedAndApproveAlice(usdcAmount);

        // Expect the Minted event
        vm.expectEmit(true, false, false, true, address(swap));
        emit OpenPayOUSDSwap.Minted(alice, usdcAmount, expectedOUSD, expectedFee);

        vm.prank(alice);
        swap.mintOUSD(usdcAmount);

        // USDC moved from alice to swap
        assertEq(usdc.balanceOf(alice),        0);
        assertEq(usdc.balanceOf(address(swap)), usdcAmount);

        // OUSD minted to alice
        assertEq(ousd.balanceOf(alice), expectedOUSD);
        assertEq(ousd.totalSupply(),    expectedOUSD);

        // pendingFees updated
        assertEq(swap.pendingFees(), expectedFee);
    }

    function test_MintOUSD_PendingFeesAccumulate() public {
        uint256 amount = 100 * ONE_USDC;
        (uint256 fee1, ) = swap.computeFee(amount);

        _mintForAlice(amount);
        assertEq(swap.pendingFees(), fee1);

        // Mint again with bob
        usdc.mint(bob, amount);
        vm.prank(bob);
        usdc.approve(address(swap), amount);
        vm.prank(bob);
        swap.mintOUSD(amount);

        assertEq(swap.pendingFees(), fee1 * 2);
    }

    function test_MintOUSD_ZeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(OpenPayOUSDSwap.ZeroAmount.selector);
        swap.mintOUSD(0);
    }

    // ── redeemOUSD ────────────────────────────────────────────────────────────

    function test_RedeemOUSD_HappyPath() public {
        uint256 usdcDeposit = 1_000 * ONE_USDC;

        // First mint OUSD for alice
        (uint256 ousdMinted, ) = _mintForAlice(usdcDeposit);

        uint256 ousdToRedeem = ousdMinted;
        (uint256 expectedFee, uint256 expectedUsdcOut) = swap.computeFee(ousdToRedeem);

        uint256 swapUsdcBefore = usdc.balanceOf(address(swap));

        vm.expectEmit(true, false, false, true, address(swap));
        emit OpenPayOUSDSwap.Redeemed(alice, ousdToRedeem, expectedUsdcOut, expectedFee);

        vm.prank(alice);
        swap.redeemOUSD(ousdToRedeem);

        // OUSD burned
        assertEq(ousd.balanceOf(alice), 0);
        assertEq(ousd.totalSupply(),    0);

        // USDC returned to alice
        assertEq(usdc.balanceOf(alice), expectedUsdcOut);

        // Swap lost usdcOut from its balance
        assertEq(usdc.balanceOf(address(swap)), swapUsdcBefore - expectedUsdcOut);

        // pendingFees accumulated both mint fee and redeem fee
        (uint256 mintFee,) = swap.computeFee(usdcDeposit);
        assertEq(swap.pendingFees(), mintFee + expectedFee);
    }

    function test_RedeemOUSD_ZeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(OpenPayOUSDSwap.ZeroAmount.selector);
        swap.redeemOUSD(0);
    }

    // ── fee cap ───────────────────────────────────────────────────────────────

    function test_FeeCap_MintOUSD_LargeAmount() public {
        uint256 bigAmount = 600_000_000; // triggers cap at 5_000_000
        uint256 expectedFee = FEE_CAP;
        uint256 expectedOUSD = bigAmount - expectedFee;

        _seedAndApproveAlice(bigAmount);

        vm.prank(alice);
        swap.mintOUSD(bigAmount);

        assertEq(swap.pendingFees(),    expectedFee);
        assertEq(ousd.balanceOf(alice), expectedOUSD);
    }

    function test_FeeCap_RedeemOUSD_LargeAmount() public {
        uint256 bigAmount = 600_000_000;
        (uint256 ousdMinted, ) = _mintForAlice(bigAmount);

        uint256 expectedFee = FEE_CAP;
        uint256 expectedUsdcOut = ousdMinted - expectedFee;

        uint256 feesBefore = swap.pendingFees();
        vm.prank(alice);
        swap.redeemOUSD(ousdMinted);

        assertEq(swap.pendingFees(), feesBefore + expectedFee);
        assertEq(usdc.balanceOf(alice), expectedUsdcOut);
    }

    // ── pause / unpause ───────────────────────────────────────────────────────

    function test_Pause_BlocksMintOUSD() public {
        uint256 amount = 100 * ONE_USDC;
        _seedAndApproveAlice(amount);

        vm.prank(owner);
        swap.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        swap.mintOUSD(amount);
    }

    function test_Pause_BlocksRedeemOUSD() public {
        // First mint some OUSD for alice before pausing
        (uint256 ousdOut, ) = _mintForAlice(100 * ONE_USDC);

        vm.prank(owner);
        swap.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        swap.redeemOUSD(ousdOut);
    }

    function test_Unpause_RestoresMintOUSD() public {
        uint256 amount = 100 * ONE_USDC;
        _seedAndApproveAlice(amount);

        vm.prank(owner);
        swap.pause();

        vm.prank(owner);
        swap.unpause();

        // Should succeed after unpause
        vm.prank(alice);
        swap.mintOUSD(amount);

        assertGt(ousd.balanceOf(alice), 0);
    }

    function test_Unpause_RestoresRedeemOUSD() public {
        (uint256 ousdOut, ) = _mintForAlice(100 * ONE_USDC);

        vm.prank(owner);
        swap.pause();

        vm.prank(owner);
        swap.unpause();

        vm.prank(alice);
        swap.redeemOUSD(ousdOut);

        assertEq(ousd.balanceOf(alice), 0);
    }

    function test_Pause_RevertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.pause();
    }

    function test_Unpause_RevertsIfNotOwner() public {
        vm.prank(owner);
        swap.pause();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.unpause();
    }

    // ── claimFees ─────────────────────────────────────────────────────────────

    function test_ClaimFees_HappyPath() public {
        uint256 amount = 1_000 * ONE_USDC;
        _mintForAlice(amount);

        uint256 pendingBefore = swap.pendingFees();
        assertGt(pendingBefore, 0);

        uint256 feeWalletBefore = usdc.balanceOf(feeWallet);

        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(swap));
        emit OpenPayOUSDSwap.FeesClaimed(pendingBefore);
        swap.claimFees();

        // pendingFees reset to 0
        assertEq(swap.pendingFees(), 0);

        // feeWallet received the fees
        assertEq(usdc.balanceOf(feeWallet), feeWalletBefore + pendingBefore);
    }

    function test_ClaimFees_RevertsIfNoPendingFees() public {
        vm.prank(owner);
        vm.expectRevert(OpenPayOUSDSwap.NoPendingFees.selector);
        swap.claimFees();
    }

    function test_ClaimFees_RevertsIfNotOwner() public {
        _mintForAlice(100 * ONE_USDC);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.claimFees();
    }

    // ── setFeeWallet ──────────────────────────────────────────────────────────

    function test_SetFeeWallet_HappyPath() public {
        address newWallet = makeAddr("newFeeWallet");

        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(swap));
        emit OpenPayOUSDSwap.FeeWalletUpdated(newWallet);
        swap.setFeeWallet(newWallet);

        assertEq(swap.feeWallet(), newWallet);
    }

    function test_SetFeeWallet_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(OpenPayOUSDSwap.ZeroAddress.selector);
        swap.setFeeWallet(address(0));
    }

    function test_SetFeeWallet_RevertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        swap.setFeeWallet(makeAddr("newWallet"));
    }

    // ── renounceOwnership ─────────────────────────────────────────────────────

    function test_RenounceOwnership_AlwaysReverts() public {
        vm.prank(owner);
        vm.expectRevert(bytes("OpenPayOUSDSwap: renounce disabled"));
        swap.renounceOwnership();
    }

    function test_RenounceOwnership_RevertsForNonOwnerToo() public {
        vm.prank(alice);
        vm.expectRevert(bytes("OpenPayOUSDSwap: renounce disabled"));
        swap.renounceOwnership();
    }

    // ── Resting-state invariant (unit check) ──────────────────────────────────
    //   USDC.balanceOf(swap) == OUSD.totalSupply() + pendingFees

    function test_Invariant_AfterMint() public {
        _mintForAlice(500 * ONE_USDC);
        _assertRestingInvariant();
    }

    function test_Invariant_AfterRedeem() public {
        (uint256 ousdOut, ) = _mintForAlice(500 * ONE_USDC);
        vm.prank(alice);
        swap.redeemOUSD(ousdOut / 2);
        _assertRestingInvariant();
    }

    function test_Invariant_AfterClaimFees() public {
        _mintForAlice(500 * ONE_USDC);
        vm.prank(owner);
        swap.claimFees();
        // After fees are claimed, USDC left in swap == OUSD totalSupply + 0 pendingFees
        _assertRestingInvariant();
    }

    function _assertRestingInvariant() internal view {
        uint256 swapUsdc   = usdc.balanceOf(address(swap));
        uint256 ousdSupply = ousd.totalSupply();
        uint256 fees       = swap.pendingFees();
        assertEq(swapUsdc, ousdSupply + fees, "invariant: USDC_balance != OUSD_supply + pendingFees");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzz tests
// ─────────────────────────────────────────────────────────────────────────────

contract OpenPayOUSDFuzzTest is BaseTest {

    uint256 internal constant FEE_BPS  = 100;
    uint256 internal constant FEE_CAP  = 5_000_000;

    /// @dev For any positive uint96 amount:
    ///      USDC deposited == OUSD received + fee charged
    function testFuzz_MintOUSD_InputEqualsOutputPlusFee(uint96 amount) public {
        vm.assume(amount > 0);

        uint256 expectedFee = (uint256(amount) * FEE_BPS) / 10_000;
        if (expectedFee > FEE_CAP) expectedFee = FEE_CAP;
        // fee < amount always holds for feeBps=100 with amount>0 (fee≤1% of amount < amount)
        uint256 expectedOUSD = uint256(amount) - expectedFee;

        usdc.mint(alice, amount);
        vm.prank(alice);
        usdc.approve(address(swap), amount);

        vm.prank(alice);
        swap.mintOUSD(amount);

        assertEq(ousd.balanceOf(alice), expectedOUSD, "ousd minted mismatch");
        assertEq(swap.pendingFees(),    expectedFee,   "fee mismatch");

        // Resting-state invariant
        assertEq(
            usdc.balanceOf(address(swap)),
            ousd.totalSupply() + swap.pendingFees(),
            "invariant broken after mint"
        );
    }

    /// @dev For any positive uint96 amount redeemed:
    ///      OUSD burned == USDC returned + fee charged
    function testFuzz_RedeemOUSD_InputEqualsOutputPlusFee(uint96 amount) public {
        vm.assume(amount > 0);

        // First mint OUSD for alice by depositing exactly `amount` USDC worth of OUSD.
        // We need alice to have `amount` OUSD to redeem. Easiest: mint USDC 1:1
        // to swap so it has enough, then directly mint OUSD via the token contract.
        usdc.mint(address(swap), amount); // give swap the USDC it will return
        vm.prank(address(swap));          // swap is the authorised minter
        ousd.mint(alice, amount);

        // Now redeem
        uint256 expectedFee = (uint256(amount) * FEE_BPS) / 10_000;
        if (expectedFee > FEE_CAP) expectedFee = FEE_CAP;
        uint256 expectedUsdcOut = uint256(amount) - expectedFee;

        vm.prank(alice);
        swap.redeemOUSD(amount);

        assertEq(ousd.balanceOf(alice),  0,               "ousd not fully burned");
        assertEq(usdc.balanceOf(alice),  expectedUsdcOut, "usdc returned mismatch");
        assertEq(swap.pendingFees(),     expectedFee,      "fee mismatch");

        // Resting-state invariant
        assertEq(
            usdc.balanceOf(address(swap)),
            ousd.totalSupply() + swap.pendingFees(),
            "invariant broken after redeem"
        );
    }
}
