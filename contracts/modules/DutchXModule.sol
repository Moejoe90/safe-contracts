pragma solidity 0.5.0;
import "../base/Module.sol";
import "../base/ModuleManager.sol";
import "../base/OwnerManager.sol";
import "../common/Enum.sol";


/// @title DutchX Module - Allows to execute transactions to DutchX contract for whitelisted token pairs without confirmations and deposit tokens in the DutchX.
/// @author Denis Granha - <denis@gnosis.pm>
contract DutchXModule is Module {

    string public constant NAME = "DutchX Module";
    string public constant VERSION = "0.0.2";

    // Whitelisted token functions
    bytes32 public constant APPROVE_TOKEN_FUNCTION_IDENTIFIER = hex"095ea7b3";
    bytes32 public constant DEPOSIT_WETH_FUNCTION_IDENTIFIER = hex"d0e30db0";
    // Whitelisted dx functions
    bytes32 public constant DEPOSIT_DX_FUNCTION_IDENTIFIER = hex"47e7ef24";
    bytes32 public constant POST_SELL_DX_FUNCTION_IDENTIFIER = hex"59f96ae5";
    bytes32 public constant POST_BUY_DX_FUNCTION_IDENTIFIER = hex"5e7f22c2";
    bytes32 public constant CLAIM_SELLER_DX_FUNCTION_IDENTIFIER = hex"7895dd21";
    bytes32 public constant CLAIM_BUYER_DX_FUNCTION_IDENTIFIER = hex"d3cc8d1c";
    
    address public dutchXAddress;
    // isWhitelisted mapping maps destination address to boolean.
    mapping (address => bool) public isWhitelistedToken;

    /// @dev Setup function sets initial storage of contract.
    /// @param dx DutchX Proxy Address.
    /// @param tokens List of whitelisted tokens.
    function setup(address dx, address[] tokens)
        public
    {
        setManager();
        dutchXAddress = dx;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            require(token != 0, "Invalid token provided");
            isWhitelistedToken[token] = true;
        }
    }

    /// @dev Allows to add token to whitelist. This can only be done via a Safe transaction.
    /// @param token ERC20 token address.
    function addToWhitelist(address token)
        public
        authorized
    {
        require(token != 0, "Invalid token provided");
        require(!isWhitelistedToken[token], "Token is already whitelisted");
        isWhitelistedToken[token] = true;
    }

    /// @dev Allows to remove token from whitelist. This can only be done via a Safe transaction.
    /// @param token ERC20 token address.
    function removeFromWhitelist(address token)
        public
        authorized
    {
        require(isWhitelistedToken[token], "Token is not whitelisted");
        isWhitelistedToken[token] = false;
    }

    /// @dev Allows to change DutchX Proxy contract address. This can only be done via a Safe transaction.
    /// @param dx New proxy contract address for DutchX.
    function changeDXProxy(address dx)
        public
        authorized
    {
        require(dx != 0, "Invalid address provided");
        dutchXAddress = dx;
    }

    /// @dev Returns if Safe transaction is to DutchX contract and with whitelisted tokens.
    /// @param to Dutch X address or Whitelisted token (only for approve operations for DX).
    /// @param value Not checked.
    /// @param data Allowed operations (postSellOrder, postBuyOrder, claimTokensFromSeveralAuctionsAsBuyer, claimTokensFromSeveralAuctionsAsSeller, deposit).
    /// @return Returns if transaction can be executed.
    function executeWhitelisted(address to, uint256 value, bytes data)
        public
        returns (bool)
    {
        // Only Safe owners are allowed to execute transactions to whitelisted accounts.
        require(OwnerManager(manager).isOwner(msg.sender), "Method can only be called by an owner");

        // Only DutchX Proxy and Whitelisted tokens are allowed as destination
        require(to == dutchXAddress || isWhitelistedToken[to], "Destination address is not allowed");

        // Decode data
        bytes32 functionIdentifier;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            functionIdentifier := mload(add(data, 0x20))
        }

        // Only approve tokens function and deposit (in the case of WETH) is allowed against token contracts, and DutchX proxy must be the spender (for approve)
        if (functionIdentifier != DEPOSIT_WETH_FUNCTION_IDENTIFIER){
            require(value == 0, "Eth transactions only allowed for wrapping ETH");
        }

        // Only these functions:
        // PostSellOrder, postBuyOrder, claimTokensFromSeveralAuctionsAsBuyer, claimTokensFromSeveralAuctionsAsSeller, deposit
        // Are allowed for the Dutch X contract
        if (functionIdentifier == APPROVE_TOKEN_FUNCTION_IDENTIFIER) {
            (address spender, uint256 amount) = abi.decode(data, (address, uint256));
            require(spender == dutchXAddress, "Spender must be the DutchX Contract");
        } else if (functionIdentifier == DEPOSIT_DX_FUNCTION_IDENTIFIER) {
            (address token, uint256 amount) = abi.decode(data, (address, uint256));
            require (isWhitelistedToken[token], "Only whitelisted tokens can be deposit on the DutchX");
        } else if (functionIdentifier == POST_SELL_DX_FUNCTION_IDENTIFIER) {
            (address sellToken, address buyToken, uint256 auctionIndex, uint256 amount) = abi.decode(data, (address, address, uint256, uint256));
            require (isWhitelistedToken[sellToken] && isWhitelistedToken[buyToken], "Only whitelisted tokens can be sold");
        } else if (functionIdentifier == POST_BUY_DX_FUNCTION_IDENTIFIER) {
            (address sellToken, address buyToken, uint256 auctionIndex, uint256 amount) = abi.decode(data, (address, address, uint256, uint256));
            require (isWhitelistedToken[sellToken] && isWhitelistedToken[buyToken], "Only whitelisted tokens can be bought");
        } else if ( functionIdentifier != CLAIM_SELLER_DX_FUNCTION_IDENTIFIER && functionIdentifier != CLAIM_BUYER_DX_FUNCTION_IDENTIFIER && functionIdentifier != DEPOSIT_WETH_FUNCTION_IDENTIFIER) {
            return false; // Other functions are not allowed
        }

        require(manager.execTransactionFromModule(to, value, data, Enum.Operation.Call), "Could not execute transaction");
    }
}
