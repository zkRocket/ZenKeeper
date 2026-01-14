// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import {IVault} from "../interfaces/IVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

contract MockVault is IVault, AccessControl {
    IERC20 public immutable zkBTC;
    IERC20 public immutable l2t;
    /// @notice 记录用户zkBTC 余额：user => amount
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
    constructor(IERC20 _zkBTC, IERC20 _l2t) {
        zkBTC = _zkBTC;
        l2t = _l2t;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
      }


    function credit(address _to, uint256 _amount) onlyOperator external {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (zkBTC.balanceOf(address(this)) >= _amount, "Vault balance too low");
        balances[_to] += _amount;
        emit Credit(_to, _amount);
    }

    function settle(address _to, uint256 _amount) onlyOperator external {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require (l2t.balanceOf(address(this)) >= _amount, "Vault balance too low");
        bool success = l2t.transfer(_to, _amount);
        require(success, "Transfer failed");
        emit Settle(_to, _amount);
    }

    function investZKBTCTo(address _to, uint256 _amount) external onlyAdmin {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");

        uint256 amount = zkBTC.balanceOf(address(this));
        require(amount >= _amount, "Insufficient funds");
        bool success = zkBTC.transfer(_to, _amount);
        require(success, "Transfer failed");
    }

    function investL2TTo(address _to, uint256 _amount) external onlyAdmin {
        require(_to != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");

        uint256 amount = l2t.balanceOf(address(this));
        require(amount >= _amount, "Insufficient funds");
        bool success = l2t.transfer(_to, _amount);
        require(success, "Transfer failed");
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
                interfaceId == type(IVault).interfaceId || // 注册 IVault 所在的接口
                super.supportsInterface(interfaceId);
    }
}
