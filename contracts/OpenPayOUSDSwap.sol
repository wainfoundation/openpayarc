// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IOpenPayOUSD {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

contract OpenPayOUSDSwap is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error NoPendingFees();

    event Minted(address indexed payer, uint256 usdcIn, uint256 ousdOut, uint256 fee);
    event Redeemed(address indexed redeemer, uint256 ousdIn, uint256 usdcOut, uint256 fee);
    event FeesClaimed(uint256 amount);
    event FeeWalletUpdated(address indexed newWallet);

    address public immutable usdc;
    IOpenPayOUSD public immutable ousd;

    address public feeWallet;
    uint256 public immutable feeBps;
    uint256 public immutable feeCapUsdc;
    uint256 public pendingFees;

    constructor(address usdc_, address ousd_, address feeWallet_, address owner_) Ownable(_requireNonZero(owner_)) {
        if (usdc_ == address(0) || ousd_ == address(0) || feeWallet_ == address(0)) revert ZeroAddress();
        require(usdc_.code.length > 0, "usdc not a contract");
        require(ousd_.code.length > 0, "ousd not a contract");

        usdc = usdc_;
        ousd = IOpenPayOUSD(ousd_);
        feeWallet = feeWallet_;

        feeBps = 100;
        feeCapUsdc = 5_000_000;
    }

    /// @dev Renouncing ownership is disabled — use transferOwnership instead.
    function renounceOwnership() public pure override {
        revert("OpenPayOUSDSwap: renounce disabled");
    }

    function mintOUSD(uint256 usdcAmount) external whenNotPaused {
        (uint256 fee, uint256 ousdMinted) = _computeFee(usdcAmount);

        pendingFees += fee;

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);
        ousd.mint(msg.sender, ousdMinted);

        emit Minted(msg.sender, usdcAmount, ousdMinted, fee);
    }

    function redeemOUSD(uint256 ousdAmount) external whenNotPaused {
        (uint256 fee, uint256 usdcOut) = _computeFee(ousdAmount);

        pendingFees += fee;

        ousd.burn(msg.sender, ousdAmount);
        IERC20(usdc).safeTransfer(msg.sender, usdcOut);

        emit Redeemed(msg.sender, ousdAmount, usdcOut, fee);
    }

    function claimFees() external onlyOwner {
        uint256 amount = pendingFees;
        if (amount == 0) revert NoPendingFees();

        pendingFees = 0;
        IERC20(usdc).safeTransfer(feeWallet, amount);

        emit FeesClaimed(amount);
    }

    function setFeeWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert ZeroAddress();

        feeWallet = newWallet;
        emit FeeWalletUpdated(newWallet);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function computeFee(uint256 amount) external view returns (uint256 fee, uint256 netAmount) {
        return _computeFee(amount);
    }

    function _computeFee(uint256 amount) internal view returns (uint256 fee, uint256 netAmount) {
        if (amount == 0) revert ZeroAmount();

        fee = (amount * feeBps) / 10_000;
        if (fee > feeCapUsdc) {
            fee = feeCapUsdc;
        }
        if (fee >= amount) revert ZeroAmount();

        netAmount = amount - fee;
    }

    function _requireNonZero(address account) private pure returns (address) {
        if (account == address(0)) revert ZeroAddress();
        return account;
    }
}
