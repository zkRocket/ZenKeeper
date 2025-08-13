// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts@5.4.0/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts@5.4.0/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts@5.4.0/access/AccessControl.sol";

/// @notice 设置应用地址（仅限 admin）
/* appData
fields:               appData
length(bytes):        operation    type  operation_specified_data
                        1 byte    1byte   xxx
operation:
1- Deploy
2- Mint
3- Transfer
4- Burn

type:
1 - ERC20Capped
2 - ERC721Capped
3 - User Specified

deploy a ERC20 Capped:
operation    type       name      symbol   totalSupply   decimal   maxInEachMint
  (1)          (1)        8 bytes    4 bytes     16 bytes   1 bytes    1 bytes

deploy a ERC721 Capped:
operation    type       name      symbol     totalSupply   maxInEachMint  urlLength    url
  (1)         (2)      8 bytes    4 bytes     16 bytes       1 bytes       2 bytes    xx

deploy a User Specified:
operation    type        tokenAddress
  (1)          (3)          20 bytes


mint:
mint a ERC20:
operation     type     name       to      amount
  (2)          (1)    8bytes   20bytes    1bytes


mint a ERC721:
operation  type       name       to         amount
  (2)       (2)       8bytes   20bytes     1bytes


mint a User Specified:
operation    type       tokenAddress    to       amount
(2)          (3)        20 bytes       20bytes   32bytes


transfer a ERC20:
operation    type     name      to             amount    signature
  3          (1)     8bytes    20 bytes       32 bytes    64 bytes


transfer a ERC721:
operation    type       name      to            tokenId    signature
  3          (2)       8bytes    20 bytes       32 bytes    64 bytes


transfer a User Specified:
operation    type       tokenAddress    to             amount    signature
  3          (3)        20 bytes       20 bytes       32 bytes    64 bytes


burn a ERC20:
operation    type     name      amount      signature
  4          (1)     8bytes     32 bytes     64 bytes


burn a ERC721:
operation    type       name      tokenId      signature
  4          (2)       8bytes     32 bytes     64 bytes


burn a User Specified:
operation    type       tokenAddress    amount      signature
4            (3)         20 bytes       32 bytes     64 bytes
*/

contract ZKRunes is AccessControl {
    struct ERC20Info {
        address token;
        string name;
        string symbol;
    }

    struct ERC721Info {
        address token;
        string name;
        string symbol;
    }

    mapping(bytes8 => ERC20Info) public erc20Tokens;
    mapping(bytes8 => ERC721Info) public erc721Tokens;
    mapping(bytes8 => address) public userTokens;

    constructor() {
        grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function execute(bytes calldata appData) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint8 operation = uint8(appData[0]);
        uint8 tokenType = uint8(appData[1]);

        if (operation == 1) {
            _deploy(tokenType, appData[2:]);
        } else if (operation == 2) {
            _mint(tokenType, appData[2:]);
        } else if (operation == 3) {
            _transfer(tokenType, appData[2:]);
        } else if (operation == 4) {
            _burn(tokenType, appData[2:]);
        } else {
            revert("Unknown operation");
        }
    }

    function _deploy(uint8 tokenType, bytes calldata data) internal {
        if (tokenType == 1) {
            // ERC20Capped
            bytes8 nameBytes = bytes8(data[0:8]);
            bytes4 symbolBytes = bytes4(data[8:12]);
            uint128 totalSupply = uint128(bytes16(data[12:28]));
            uint8 decimals = uint8(data[28]);
            uint8 maxInEachMint = uint8(data[29]);

            string memory name = string(abi.encodePacked(nameBytes));
            string memory symbol = string(abi.encodePacked(symbolBytes));

            ERC20CappedToken token = new ERC20CappedToken(name, symbol, totalSupply, decimals);
            erc20Tokens[nameBytes] = ERC20Info(address(token), name, symbol);
        } else if (tokenType == 2) {
            // ERC721Capped
            bytes8 nameBytes = bytes8(data[0:8]);
            bytes4 symbolBytes = bytes4(data[8:12]);
            uint128 totalSupply = uint128(bytes16(data[12:28]));
            uint8 urlLength = uint8(data[28]);

            string memory name = string(abi.encodePacked(nameBytes));
            string memory symbol = string(abi.encodePacked(symbolBytes));
            //TODO, get the url from data

            ERC721CappedToken token = new ERC721CappedToken(name, symbol);
            erc721Tokens[nameBytes] = ERC721Info(address(token), name, symbol);
        } else if (tokenType == 3) {
            address tokenAddr = address(bytes20(data[0:20]));
            bytes8 nameBytes = bytes8(data[20:28]); // optional
            userTokens[nameBytes] = tokenAddr;
        }
    }

    function _mint(uint8 tokenType, bytes calldata data) internal {
        if (tokenType == 1) {
            // Mint ERC20
            bytes8 nameBytes = bytes8(data[0:8]);
            uint8 amount = uint8(data[8]);

            ERC20Info storage info = erc20Tokens[nameBytes];
            require(info.token != address(0), "ERC20 token not found");

            ERC20CappedToken(info.token).mint(msg.sender, amount * (10 ** ERC20CappedToken(info.token).decimals()));
        } else if (tokenType == 2) {
            // Mint ERC721
            bytes8 nameBytes = bytes8(data[0:8]);
            uint8 amount = uint8(data[8]);

            ERC721Info storage info = erc721Tokens[nameBytes];
            require(info.token != address(0), "ERC721 token not found");

            ERC721CappedToken token = ERC721CappedToken(info.token);
            for (uint256 i = 0; i < amount; i++) {
                token.mint(msg.sender, token.totalSupply());
            }
        } else if (tokenType == 3) {
            // Mint User Specified
            address tokenAddr = address(bytes20(data[0:20]));
            uint256 amount = uint256(bytes32(data[20:52]));
            IERC20(tokenAddr).transfer(msg.sender, amount); // 假设用户token允许mint即transfer
        }
    }


    function _transfer(uint8 tokenType, bytes calldata data) internal {
        if (tokenType == 1) {
            // ERC20
            bytes8 nameBytes = bytes8(data[0:8]);
            address to = address(bytes20(data[8:28]));
            uint256 amount = uint256(bytes32(data[28:60]));
            bytes memory signature = data[60:124];

            ERC20Info storage info = erc20Tokens[nameBytes];
            require(info.token != address(0), "ERC20 token not found");

            // TODO: 验证 signature（略过，假设有效）
            ERC20CappedToken(info.token).transfer(to, amount);
        } else if (tokenType == 2) {
            // ERC721
            bytes8 nameBytes = bytes8(data[0:8]);
            address to = address(bytes20(data[8:28]));
            uint256 tokenId = uint256(bytes32(data[28:60]));
            bytes memory signature = data[60:124];

            ERC721Info storage info = erc721Tokens[nameBytes];
            require(info.token != address(0), "ERC721 token not found");

            // TODO: 验证 signature（略过，假设有效）
            ERC721CappedToken(info.token).safeTransferFrom(msg.sender, to, tokenId);
        } else if (tokenType == 3) {
            // User Specified
            address tokenAddr = address(bytes20(data[0:20]));
            address to = address(bytes20(data[20:40]));
            uint256 amount = uint256(bytes32(data[40:72]));
            bytes memory signature = data[72:136];

            // TODO: 验证 signature（略过，假设有效）
            IERC20(tokenAddr).transferFrom(msg.sender, to, amount);
        }
    }


    function _burn(uint8 tokenType, bytes calldata data) internal {
        if (tokenType == 1) {
            // ERC20
            bytes8 nameBytes = bytes8(data[0:8]);
            uint256 amount = uint256(bytes32(data[8:40]));
            bytes memory signature = data[40:104];

            ERC20Info storage info = erc20Tokens[nameBytes];
            require(info.token != address(0), "ERC20 token not found");

            // TODO: 验证 signature（略过，假设有效）
            ERC20CappedToken token = ERC20CappedToken(info.token);
            token.transferFrom(msg.sender, address(0), amount); // Send to 0x0 to burn
        } else if (tokenType == 2) {
            // ERC721
            bytes8 nameBytes = bytes8(data[0:8]);
            uint256 tokenId = uint256(bytes32(data[8:40]));
            bytes memory signature = data[40:104];

            ERC721Info storage info = erc721Tokens[nameBytes];
            require(info.token != address(0), "ERC721 token not found");

            // TODO: 验证 signature（略过，假设有效）
            ERC721CappedToken token = ERC721CappedToken(info.token);
            require(token.ownerOf(tokenId) == msg.sender, "Not owner");
            token.transferFrom(msg.sender, address(0xdead), tokenId); // 发送到黑洞地址销毁
        } else if (tokenType == 3) {
            address tokenAddr = address(bytes20(data[0:20]));
            uint256 amount = uint256(bytes32(data[20:52]));
            bytes memory signature = data[52:116];

            // TODO: 验证 signature（略过，假设有效）
            IERC20(tokenAddr).transferFrom(msg.sender, address(0), amount);
        }
    }
}

/*
TODO, 从signature 恢复出from，例如 transfer a ERC20:
operation    type     name      to             amount    signature
  3          (1)     8bytes    20 bytes       32 bytes    64 bytes
是对 operation    type     name      to             amount 这几个field 进行签名
*/
    function recoverSigner(bytes calldata message, bytes calldata signature) public pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(add(signature.offset, 0))
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // 构造 EIP-191 签名前缀的 messageHash
        // \x19Ethereum Signed Message:\n62 + raw message
        bytes32 hash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n62", message)
        );

        return ecrecover(hash, v, r, s);
    }



contract ERC20CappedToken is ERC20Capped, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint8 private _decimals;

    event AdminTransfer(address indexed admin, address indexed from, address indexed to, uint256 amount);
    event AdminBurn(address indexed admin, address indexed from, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        uint256 cap,
        uint8 __decimals
    ) ERC20(name, symbol) ERC20Capped(cap) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _decimals = __decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        super._mint(to, amount); // includes cap check
    }

    function adminTransfer(address from, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        super._transfer(from, to, amount);
        emit AdminTransfer(msg.sender, from, to, amount);
    }

    function adminBurn(address from, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        super._burn(from, amount);
        emit AdminBurn(msg.sender, from, amount);
    }
}


contract ERC721CappedToken is ERC721Enumerable, ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public maxSupply;

    event AdminTransfer(address indexed admin, address indexed from, address indexed to, uint256 tokenId);
    event AdminBurn(address indexed admin, address indexed from, uint256 tokenId);

    constructor(string memory name, string memory symbol, uint256 cap) ERC721(name, symbol) {
        grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(MINTER_ROLE, msg.sender);
        maxSupply = cap;
    }

    function mint(address to, uint256 tokenId, string memory uri) public onlyRole(MINTER_ROLE) {
        require(totalSupply() < maxSupply, "Max supply exceeded");
        super._mint(to, tokenId);
        super._setTokenURI(tokenId, uri);
    }

    /// @notice Admin can transfer token from any address without approval
    function adminTransfer(address from, address to, uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        super._transfer(from, to, tokenId);
        emit AdminTransfer(msg.sender, from, to, tokenId);
    }

    /// @notice Admin can burn token from any address
    function adminBurn(address from, uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address owner = ownerOf(tokenId);
        require(msg.sender == owner, "Only owner can burn");
        super._burn(tokenId);
        emit AdminBurn(msg.sender, owner, tokenId);
    }

    // The following functions are overrides required by Solidity due to multiple inheritance
    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
}