pragma solidity 0.4.24;
import "../base/Module.sol";
import "../base/ModuleManager.sol";
import "../base/OwnerManager.sol";
import "../common/Enum.sol";


/// @title DutchX Module - Allows to execute transactions to DutchX contract for whitelisted token pairs without confirmations and deposit tokens in the DutchX.
/// @author Denis Granha - <denis@gnosis.pm>
contract DutchXModule is Module {

    string public constant NAME = "DutchX Module";
    string public constant VERSION = "0.0.2";

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

        // Only approve tokens function is allowed against token contract, and DutchX proxy must be the spender

        // Only these functions:
        // PostSellOrder, postBuyOrder, claimTokensFromSeveralAuctionsAsBuyer, claimTokensFromSeveralAuctionsAsSeller, deposit
        // Are allowed for the Dutch X contract

        
        require(to == dutchXAddress, "Destionation address is not allowed");
        require(manager.execTransactionFromModule(to, value, data, Enum.Operation.Call), "Could not execute transaction");
    }
}
