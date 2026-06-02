// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CeloStrikerPaymentRouter — minimal cUSD router for in-game purchases on Celo.
///
/// This is a Celo-mainnet port of BaseStrikerPaymentRouter — same logic, same
/// event shape, same ABI. Only difference: token here is Celo's native USD
/// stablecoin (cUSD) instead of USDC, and the contract is deployed on Celo
/// mainnet (chainId 42220) rather than Base.
///
/// Players approve(this, amount) cUSD once, then call `payForItem(itemSku, qty, amount)`.
/// The contract pulls cUSD from the buyer, forwards the full amount to the
/// configured treasury, and emits `ItemPaid(buyer, sku, qty, amount)`.
/// Indexers (Celoscan, Talent Protocol, MiniPay analytics) can attribute the
/// purchase to the buyer + the item.
///
/// Why this exists for Celo:
///   - direct `cUSD.transfer(treasury)` works but produces no semantic event.
///     Indexers only see "Buyer sent X cUSD to Treasury" — no item context.
///   - This router emits a typed event with the SKU so leaderboards and
///     anti-cheat can prove which on-chain purchase corresponds to which
///     in-game boost.
///   - Counts toward Celo Proof of Ship: one verified contract on Celo
///     mainnet with real player activity.
///
/// cUSD on Celo mainnet: 0x765DE816845861e75A25fCA122bb6898B8B1282a (18 decimals).
/// Treasury (deploy parameter): the wallet that receives shop revenue.
///   For BaseStriker we reuse the same treasury as on Base for unified
///   bookkeeping: 0xe569A1f798D14809A076ea1c11cb13d698DFcE64
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

contract CeloStrikerPaymentRouter {
    /// cUSD on Celo mainnet. Immutable — set once at construction.
    /// Named `stable` (not `cusd`) so the contract reads naturally if we ever
    /// add a second stablecoin variant.
    IERC20 public immutable stable;

    /// Owner / governor. Can rotate the treasury and pause new payments.
    address public owner;

    /// Where cUSD flows on every `payForItem` call.
    address public treasury;

    /// Kill-switch — when true, `payForItem` reverts. Owner-controlled.
    bool public paused;

    /// Running total of cUSD routed since deploy (informational).
    uint256 public totalRouted;

    /// One event per purchase. `sku` is an opaque 32-byte shop item ID
    /// (the frontend / backend agree on the mapping). `qty` is the number
    /// of items bought in this call; `amount` is the cUSD base units actually
    /// pulled. Buyer is `msg.sender`.
    event ItemPaid(address indexed buyer, bytes32 indexed sku, uint32 qty, uint256 amount, uint256 timestamp);

    event TreasuryUpdated(address indexed previous, address indexed next);
    event Paused(bool paused);
    event OwnerTransferred(address indexed previous, address indexed next);

    error NotOwner();
    error ZeroAddress();
    error PaymentPaused();
    error TransferFailed();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param _stable   The cUSD token on Celo (0x765DE816845861e75A25fCA122bb6898B8B1282a).
    /// @param _treasury The wallet that receives every shop cUSD payment.
    constructor(address _stable, address _treasury) {
        if (_stable == address(0) || _treasury == address(0)) revert ZeroAddress();
        stable = IERC20(_stable);
        treasury = _treasury;
        owner = msg.sender;
        emit TreasuryUpdated(address(0), _treasury);
        emit OwnerTransferred(address(0), msg.sender);
    }

    /// Buyer flow:
    ///   1. `cUSD.approve(router, amount)` (one-time per allowance)
    ///   2. `router.payForItem(skuHash, qty, amount)`
    ///
    /// `amount` is the FULL cUSD base-unit amount (18-decimal — different from
    /// Base USDC which is 6-decimal!). The router pulls it from the buyer and
    /// forwards 100% to the treasury — no fees retained here.
    function payForItem(bytes32 sku, uint32 qty, uint256 amount) external {
        if (paused) revert PaymentPaused();
        if (amount == 0) revert ZeroAmount();
        bool ok = stable.transferFrom(msg.sender, treasury, amount);
        if (!ok) revert TransferFailed();
        totalRouted += amount;
        emit ItemPaid(msg.sender, sku, qty, amount, block.timestamp);
    }

    /// Owner-only: rotate the treasury (e.g., move to a Safe multisig).
    function setTreasury(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, next);
        treasury = next;
    }

    /// Owner-only: pause new payments. Existing approvals stay live but
    /// `payForItem` reverts until `setPaused(false)`.
    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    /// Owner-only: transfer ownership (intended for a Safe multisig).
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, next);
        owner = next;
    }
}
