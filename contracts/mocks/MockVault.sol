// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MockVault is AccessControl {
    /// @notice 用户余额：token => user => amount
    mapping(address => mapping(address => uint256)) public balances;

    /// @notice 支持的 ERC20 代币白名单
    mapping(address => bool) public supportedTokens;

    /// @notice operator 角色标识
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// ---------- 事件 ----------
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);

    event Claim(address indexed token, address indexed user, uint256 amount);

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

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
    constructor(IERC20 _zkBTC, IERC20 _zkLIT) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _addToken(_zkBTC);
        _addToken(_zkLIT);
    }

    function _addToken(IERC20 _token) internal {
        address tokenAddr = address(_token);
        require(!supportedTokens[tokenAddr], "Token already supported");
        supportedTokens[tokenAddr] = true;
        emit TokenAdded(tokenAddr);
    }

    /// ---------- 用户存款 ----------
    function deposit(IERC20 _token, uint256 _amount) external {
        address tokenAddr = address(_token);
        require(supportedTokens[tokenAddr], "Token not supported");
        require(_amount > 0, "Amount must be > 0");

        bool success = _token.transferFrom(msg.sender, address(this), _amount);
        require(success, "Transfer failed");

        balances[tokenAddr][msg.sender] += _amount;
        emit Deposit(tokenAddr, msg.sender, _amount);
    }

    /// ---------- 用户取款 ----------
    function withdraw(IERC20 _token, uint256 _amount) external {
        address tokenAddr = address(_token);
        require(supportedTokens[tokenAddr], "Token not supported");
        require(balances[tokenAddr][msg.sender] >= _amount, "Insufficient balance");

        balances[tokenAddr][msg.sender] -= _amount;
        bool success = _token.transfer(msg.sender, _amount);
        require(success, "Transfer failed");

        emit Withdraw(tokenAddr, msg.sender, _amount);
    }

    function claim(IERC20 _token, address _to, uint256 _amount, bool _withdrawal) onlyOperator external {
        address tokenAddr = address(_token);
        require(supportedTokens[tokenAddr], "Token not supported");
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (_token.balanceOf(address(this)) >= _amount, "Vault balance too low");

        if(_withdrawal) {
            bool success = _token.transfer(_to, _amount);
            require(success, "Transfer failed");
        }else{
            balances[tokenAddr][_to] += _amount;
            emit Claim(tokenAddr, _to, _amount);
        }
    }


    function investTo(IERC20 _token, address _to, uint256 _amount) external onlyAdmin {
        address tokenAddr = address(_token);
        require(supportedTokens[tokenAddr], "Token not supported");
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");

        uint256 amount = _token.balanceOf(address(this));
        require(amount >= _amount, "Insufficient funds");
        bool success = _token.transfer(_to, _amount);
        require(success, "Transfer failed");
    }

}
