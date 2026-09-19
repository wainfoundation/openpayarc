// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OpenPaySavings {
    error InvalidPlan(uint8 plan);
    error ZeroAmount();
    error NoPosition();
    error LockActive(uint64 lockEndsAt);
    error Unauthorized();
    error ZeroAddress();
    error RecoverUSDCForbidden();
    error TransferFailed();
    error PrincipalOverflow();
    error InterestOverflow();
    error NoInterestAccrued();
    error InsufficientReserve();

    event Deposited(address indexed user, uint8 plan, uint128 amount);
    event Withdrawn(address indexed user, uint8 plan, uint128 principal, uint128 interest);
    event InterestClaimed(address indexed user, uint8 plan, uint128 interest);
    event ReserveFunded(uint256 amount);

    struct Position {
        uint128 principal;
        uint64 depositedAt;
        uint64 lastClaimAt;
    }

    uint8 public constant PLAN_FLEXIBLE = 0;
    uint8 public constant PLAN_THIRTY_DAY = 1;
    uint8 public constant PLAN_NINETY_DAY = 2;

    IERC20 public immutable usdc;
    address public immutable owner;

    uint256 private _totalDeposited;
    uint256 private _interestReserve;
    mapping(address user => mapping(uint8 plan => Position)) private _positions;

    constructor(address usdc_, address owner_) {
        if (usdc_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        owner = owner_;
    }

    function deposit(uint8 plan, uint128 amount) external {
        _validatePlan(plan);
        if (amount == 0) revert ZeroAmount();

        Position storage position = _positions[msg.sender][plan];

        if (position.principal > 0) {
            if (plan != PLAN_FLEXIBLE) {
                uint64 lockEndsAt = position.depositedAt + _lockDuration(plan);
                if (block.timestamp < lockEndsAt) revert LockActive(lockEndsAt);
            } else {
                uint128 interest = _pendingInterest(position, plan);
                if (interest > 0) {
                    position.lastClaimAt = uint64(block.timestamp);
                    if (!usdc.transfer(msg.sender, interest)) revert TransferFailed();
                    _deductReserve(interest);
                    emit InterestClaimed(msg.sender, plan, interest);
                }
            }
        }

        uint256 newPrincipal = uint256(position.principal) + amount;
        if (newPrincipal > type(uint128).max) revert PrincipalOverflow();

        uint256 maxInterest = (newPrincipal * _apyBps(plan) * _maxAccrualWindow(plan)) / (365 days * 10_000);
        if (maxInterest > _interestReserve) revert InsufficientReserve();

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        position.principal = uint128(newPrincipal);
        position.depositedAt = uint64(block.timestamp);
        position.lastClaimAt = uint64(block.timestamp);

        _totalDeposited += amount;

        emit Deposited(msg.sender, plan, amount);
    }

    function withdraw(uint8 plan) external {
        _validatePlan(plan);

        Position storage position = _positions[msg.sender][plan];
        uint128 principal = position.principal;
        if (principal == 0) revert NoPosition();

        uint64 lockEndsAt = position.depositedAt + _lockDuration(plan);
        if (block.timestamp < lockEndsAt) revert LockActive(lockEndsAt);

        uint128 interest = _pendingInterest(position, plan);

        _totalDeposited -= principal;
        delete _positions[msg.sender][plan];

        uint256 payout = uint256(principal) + uint256(interest);
        if (!usdc.transfer(msg.sender, payout)) revert TransferFailed();

        _deductReserve(interest);

        emit Withdrawn(msg.sender, plan, principal, interest);
    }

    function claimInterest(uint8 plan) external {
        _validatePlan(plan);

        Position storage position = _positions[msg.sender][plan];
        if (position.principal == 0) revert NoPosition();

        if (plan != PLAN_FLEXIBLE) {
            uint64 lockEndsAt = position.depositedAt + _lockDuration(plan);
            if (block.timestamp < lockEndsAt) revert LockActive(lockEndsAt);
        }

        uint128 interest = _pendingInterest(position, plan);
        if (interest == 0) revert NoInterestAccrued();

        position.lastClaimAt = uint64(block.timestamp);
        if (!usdc.transfer(msg.sender, interest)) revert TransferFailed();

        _deductReserve(interest);

        emit InterestClaimed(msg.sender, plan, interest);
    }

    function pendingInterest(address user, uint8 plan) public view returns (uint128) {
        _validatePlan(plan);
        return _pendingInterest(_positions[user][plan], plan);
    }

    function getPosition(address user, uint8 plan)
        public
        view
        returns (uint128 principal, uint128 interest, uint64 depositedAt, uint64 lockEndsAt)
    {
        _validatePlan(plan);

        Position storage position = _positions[user][plan];
        principal = position.principal;
        depositedAt = position.depositedAt;
        lockEndsAt = depositedAt + _lockDuration(plan);
        interest = _pendingInterest(position, plan);
    }

    function totalDeposited() public view returns (uint256) {
        return _totalDeposited;
    }

    function reserveBalance() external view returns (uint256) {
        return _interestReserve;
    }

    function fundReserve(uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        _interestReserve += amount;
        emit ReserveFunded(amount);
    }

    function recoverToken(address token, uint256 amount) external {
        if (msg.sender != owner) revert Unauthorized();
        if (token == address(0)) revert ZeroAddress();
        if (token == address(usdc)) revert RecoverUSDCForbidden();

        if (!IERC20(token).transfer(owner, amount)) revert TransferFailed();
    }

    function _pendingInterest(Position storage position, uint8 plan) internal view returns (uint128) {
        uint128 principal = position.principal;
        if (principal == 0) return 0;

        uint64 lastClaimAt = position.lastClaimAt;
        if (block.timestamp <= lastClaimAt) return 0;

        uint256 elapsed = block.timestamp - uint256(lastClaimAt);
        uint256 interest = (uint256(principal) * _apyBps(plan) * elapsed) / (365 days * 10_000);

        if (interest > type(uint128).max) revert InterestOverflow();
        return uint128(interest);
    }

    function _deductReserve(uint256 amount) internal {
        uint256 reserve = _interestReserve;
        _interestReserve = amount >= reserve ? 0 : reserve - amount;
    }

    function _maxAccrualWindow(uint8 plan) internal pure returns (uint64) {
        if (plan == PLAN_FLEXIBLE) return 365 days;
        return _lockDuration(plan);
    }

    function _apyBps(uint8 plan) internal pure returns (uint16) {
        if (plan == PLAN_FLEXIBLE) return 420;
        if (plan == PLAN_THIRTY_DAY) return 580;
        if (plan == PLAN_NINETY_DAY) return 850;
        revert InvalidPlan(plan);
    }

    function _lockDuration(uint8 plan) internal pure returns (uint64) {
        if (plan == PLAN_FLEXIBLE) return 0;
        if (plan == PLAN_THIRTY_DAY) return 30 days;
        if (plan == PLAN_NINETY_DAY) return 90 days;
        revert InvalidPlan(plan);
    }

    function _validatePlan(uint8 plan) internal pure {
        if (plan > PLAN_NINETY_DAY) revert InvalidPlan(plan);
    }
}
