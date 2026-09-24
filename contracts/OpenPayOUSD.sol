// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OpenPayOUSD is ERC20, Ownable2Step {
    error NotSwapContract();
    error ZeroAddress();
    error ZeroAmount();
    error SwapContractAlreadySet();

    event SwapContractSet(address indexed swap);

    address public swapContract;
    bool public swapContractSet;

    constructor(string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        Ownable(_requireNonZero(owner_))
    {
        _transferOwnership(owner_);
    }

    function setSwapContract(address swap_) external onlyOwner {
        if (swapContractSet) revert SwapContractAlreadySet();
        if (swap_ == address(0)) revert ZeroAddress();

        swapContract = swap_;
        swapContractSet = true;

        emit SwapContractSet(swap_);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != swapContract) revert NotSwapContract();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != swapContract) revert NotSwapContract();
        if (from == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _burn(from, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function _requireNonZero(address account) private pure returns (address) {
        if (account == address(0)) revert ZeroAddress();
        return account;
    }
}
