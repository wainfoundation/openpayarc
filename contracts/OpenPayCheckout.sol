// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OpenPayCheckout {
    error ZeroAddress();
    error RequestNotFound();
    error RequestInactive();
    error RequestExpired();
    error RequestAlreadyPaid();
    error AmountMismatch();
    error ZeroAmount();
    error NotMerchant();
    error Unauthorized();
    error FeeTooHigh();
    error FeeCapTooLow();
    error MemoTooLong();
    error TransferFailed();

    event RequestCreated(
        bytes32 indexed requestId,
        address indexed merchant,
        uint128 amount,
        uint64 expiresAt,
        string memo,
        bool singleUse
    );
    event PaymentReceived(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed merchant,
        uint128 amount,
        uint128 fee,
        uint64 timestamp,
        string memo
    );
    event RequestDeactivated(bytes32 indexed requestId);
    event RequestReactivated(bytes32 indexed requestId);
    event FeeBpsUpdated(uint256 newFeeBps);
    event FeeCapUpdated(uint256 newCap);
    event FeeWalletUpdated(address newWallet);
    event FeesClaimed(uint256 amount);

    struct PaymentRequest {
        address merchant;
        uint128 amount;
        uint64 expiresAt;
        bool active;
        bool singleUse;
        string memo;
    }

    address public immutable usdc;
    address public feeWallet;
    address public immutable owner;
    uint256 public feeBps;
    uint256 public feeCapUsdc;
    uint256 public pendingFees;
    uint256 public paymentCount;

    mapping(bytes32 => PaymentRequest) public requests;
    mapping(bytes32 => uint256) public requestPaymentCount;
    mapping(bytes32 => bool) public requestPaidFull;

    constructor(address usdc_, address feeWallet_, address owner_) {
        if (usdc_ == address(0) || feeWallet_ == address(0) || owner_ == address(0)) revert ZeroAddress();

        usdc = usdc_;
        feeWallet = feeWallet_;
        owner = owner_;

        feeBps = 100;
        feeCapUsdc = 5_000_000;
    }

    function createRequest(uint128 amount, uint64 expiresAt, string calldata memo, bool singleUse)
        external
        returns (bytes32 requestId)
    {
        if (bytes(memo).length > 64) revert MemoTooLong();

        requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp, paymentCount++));

        requests[requestId] = PaymentRequest({
            merchant: msg.sender,
            amount: amount,
            expiresAt: expiresAt,
            active: true,
            singleUse: singleUse,
            memo: memo
        });

        emit RequestCreated(requestId, msg.sender, amount, expiresAt, memo, singleUse);
    }

    function pay(bytes32 requestId, uint128 amount, string calldata memo) external {
        PaymentRequest storage request = requests[requestId];

        if (request.merchant == address(0)) revert RequestNotFound();
        if (!request.active) revert RequestInactive();
        if (request.expiresAt > 0 && block.timestamp > request.expiresAt) revert RequestExpired();
        if (request.singleUse && requestPaidFull[requestId]) revert RequestAlreadyPaid();
        if (amount == 0) revert ZeroAmount();
        if (request.amount > 0 && amount != request.amount) revert AmountMismatch();
        if (bytes(memo).length > 64) revert MemoTooLong();

        (uint128 fee, uint128 merchantAmount) = _computeFee(amount);

        requestPaymentCount[requestId] += 1;
        if (request.singleUse) {
            requestPaidFull[requestId] = true;
        }
        pendingFees += fee;

        if (!IERC20(usdc).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        if (!IERC20(usdc).transfer(request.merchant, merchantAmount)) revert TransferFailed();

        emit PaymentReceived(requestId, msg.sender, request.merchant, amount, fee, uint64(block.timestamp), memo);
    }

    function deactivateRequest(bytes32 requestId) external {
        PaymentRequest storage request = requests[requestId];
        if (request.merchant == address(0)) revert RequestNotFound();
        if (request.merchant != msg.sender) revert NotMerchant();

        request.active = false;
        emit RequestDeactivated(requestId);
    }

    function reactivateRequest(bytes32 requestId) external {
        PaymentRequest storage request = requests[requestId];
        if (request.merchant == address(0)) revert RequestNotFound();
        if (request.merchant != msg.sender) revert NotMerchant();

        request.active = true;
        emit RequestReactivated(requestId);
    }

    function setFeeBps(uint256 newFeeBps) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newFeeBps > 200) revert FeeTooHigh();

        feeBps = newFeeBps;
        emit FeeBpsUpdated(newFeeBps);
    }

    function setFeeCapUsdc(uint256 newCap) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newCap < 100_000) revert FeeCapTooLow();

        feeCapUsdc = newCap;
        emit FeeCapUpdated(newCap);
    }

    function setFeeWallet(address newWallet) external {
        if (msg.sender != owner) revert Unauthorized();
        if (newWallet == address(0)) revert ZeroAddress();

        feeWallet = newWallet;
        emit FeeWalletUpdated(newWallet);
    }

    function claimFees() external {
        if (msg.sender != owner) revert Unauthorized();

        uint256 amount = pendingFees;
        pendingFees = 0;

        if (amount > 0 && !IERC20(usdc).transfer(feeWallet, amount)) revert TransferFailed();

        emit FeesClaimed(amount);
    }

    function getRequest(bytes32 requestId) external view returns (PaymentRequest memory) {
        return requests[requestId];
    }

    function computeFee(uint128 amount) external view returns (uint128 fee, uint128 merchantAmount) {
        return _computeFee(amount);
    }

    function _computeFee(uint128 amount) internal view returns (uint128 fee, uint128 merchantAmount) {
        uint256 calculatedFee = (uint256(amount) * feeBps) / 10_000;
        uint256 cappedFee = calculatedFee > feeCapUsdc ? feeCapUsdc : calculatedFee;

        fee = uint128(cappedFee);
        merchantAmount = amount - fee;
    }
}
