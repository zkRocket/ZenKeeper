// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IVault.sol";

contract MockVault is AccessControl, IVault {
    IERC20 public immutable zkBTC;
    /// @notice 用户余额：token => user => amount
    mapping(address => uint256) public balances;

    /// @notice operator 角色标识
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");


    /// ---------- 修饰器 ----------
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "Caller is not operator");
        _;
    }

    /// @notice 构造函数：设置 admin 为部署者，初始化支持的 token
    constructor(IERC20 _zkBTC) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        zkBTC = _zkBTC;
    }

    /// ---------- 用户存款 ----------
    function deposit(uint256 _amount) external {
        require(_amount > 0, "Amount must be > 0");

        bool success = zkBTC.transferFrom(msg.sender, address(this), _amount);
        require(success, "Transfer failed");

        balances[msg.sender] += _amount;
        emit Deposit(msg.sender, _amount);
    }

    /// ---------- 用户取款 ----------
    function withdraw(uint256 _amount) external {
        require(balances[msg.sender] >= _amount, "Insufficient balance");

        balances[msg.sender] -= _amount;
        bool success = zkBTC.transfer(msg.sender, _amount);
        require(success, "Transfer failed");

        emit Withdraw(msg.sender, _amount);
    }

    function claim(address _to, uint256 _amount, bool _withdrawal) onlyOperator external {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (zkBTC.balanceOf(address(this)) >= _amount, "Vault balance too low");

        if(_withdrawal) {
            bool success = zkBTC.transfer(_to, _amount);
            require(success, "Transfer failed");
        }else{
            balances[_to] += _amount;
            emit Claim(_to, _amount);
        }
    }

    function investTo(address _to, uint256 _amount) external onlyAdmin {
        uint256 amount = zkBTC.balanceOf(address(this));
        require(amount >= _amount, "Insufficient funds");
        bool success = zkBTC.transfer(_to, _amount);
        require(success, "Transfer failed");
    }


}
