// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Vault is AccessControl {
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
    constructor(address[] memory _tokens) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _tokens.length; i++) {
            _addToken(_tokens[i]);
        }
    }

    function _addToken(address _token) internal {
        require(_token != address(0), "Invalid token");
        require(!supportedTokens[_token], "Token already supported");
        require(_token.code.length > 0, "Not a contract");
        supportedTokens[_token] = true;
        emit TokenAdded(_token);
    }

    /// ---------- 用户存款 ----------
    function deposit(address _token, uint256 _amount) external {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");

        bool success = IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        require(success, "Transfer failed");

        balances[_token][msg.sender] += _amount;
        emit Deposit(_token, msg.sender, _amount);
    }

    /// ---------- 用户取款 ----------
    function withdraw(address _token, uint256 _amount) external {
        require(supportedTokens[_token], "Token not supported");
        require(balances[_token][msg.sender] >= _amount, "Insufficient balance");

        balances[_token][msg.sender] -= _amount;
        bool success = IERC20(_token).transfer(msg.sender, _amount);
        require(success, "Transfer failed");

        emit Withdraw(_token, msg.sender, _amount);
    }

    function claim(address _token, address _to, uint256 _amount, bool _withdrawal) onlyOperator external {
        require(supportedTokens[_token], "Token not supported");
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (IERC20(_token).balanceOf(address(this)) >= _amount, "Vault balance too low");

        if(_withdrawal) {
            bool success = IERC20(_token).transfer(_to, _amount);
            require(success, "Transfer failed");
        }else{
            balances[_token][_to] += _amount;
            emit Claim(_token, _to, _amount);
        }
    }

    /// ---------- Token 白名单管理 ----------
    function addSupportedToken(address _token) external onlyAdmin {
        _addToken(_token);
    }

    function removeSupportedToken(address _token) external onlyAdmin {
        supportedTokens[_token] = false;
        emit TokenRemoved(_token);
    }

    /// ---------- 管理员功能 ----------
    function vaultBalance(address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }

    function emergencyWithdraw(address _token) external onlyAdmin {
        require(supportedTokens[_token], "Token not supported");
        uint256 amount = IERC20(_token).balanceOf(address(this));
        bool success = IERC20(_token).transfer(msg.sender, amount);
        require(success, "Emergency withdraw failed");
    }


}
