// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IPerplExchange {
    struct OrderDesc {
        uint256 orderDescId; uint256 perpId; uint8 orderType; uint256 orderId;
        uint256 pricePNS; uint256 lotLNS; uint256 expiryBlock; bool postOnly;
        bool fillOrKill; bool immediateOrCancel; uint256 maxMatches;
        uint256 leverageHdths; uint256 lastExecutionBlock; uint256 amountCNS;
        uint256 maxNegPnlCollatBPS;
    }
    struct AccountInfo {
        uint256 accountId; uint256 balanceCNS; uint256 lockedBalanceCNS;
        uint8 frozen; address accountAddr; uint256[4] positions;
    }
    struct PerpetualInfo {
        string name; string symbol; uint256 priceDecimals; uint256 lotDecimals;
        bytes32 linkFeedId; uint256 priceTolPer100K; uint256 marginTol;
        uint256 marginTolDecimals; uint256 refPriceMaxAgeSec; uint256 positionBalanceCNS;
        uint256 insuranceBalanceCNS; uint256 markPNS; uint256 markTimestamp;
        uint256 lastPNS; uint256 lastTimestamp; uint256 oraclePNS;
        uint256 oracleTimestampSec; uint256 longOpenInterestLNS; uint256 shortOpenInterestLNS;
        uint256 fundingStartBlock; int16 fundingRatePct100k; uint256 absFundingClampPctPer100K;
        uint8 status; uint256 basePricePNS; uint256 maxBidPriceONS; uint256 minBidPriceONS;
        uint256 maxAskPriceONS; uint256 minAskPriceONS; uint256 numOrders; bool ignOracle;
    }
    function createAccount(uint256 amountCNS) external returns (uint256);
    function depositCollateral(uint256 amountCNS) external;
    function withdrawCollateral(uint256 amountCNS) external;
    function execOrder(OrderDesc calldata orderDesc) external returns (bytes memory);
    function getAccountById(uint256 accountId) external view returns (AccountInfo memory);
    function getPerpetualInfo(uint256 perpId) external view returns (PerpetualInfo memory);
}

/// @notice Monad Testnet managed vault. Depositors own proportional vault shares;
/// the keeper can only manage a bounded Perpl hedge held by this contract.
contract GentryManagedVault {
    IERC20Minimal public immutable asset;
    IPerplExchange public immutable perpl;
    address public owner;
    address public keeper;
    uint256 public totalShares;
    uint256 public perplAccountId;
    uint256 public maxHedgeSlippageBps = 200;
    mapping(address => uint256) public shares;
    mapping(uint256 => uint256) public maxHedgeLots;

    event Deposit(address indexed user, uint256 assets, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 assets, uint256 sharesBurned);
    event KeeperSet(address indexed keeper);
    event PerplAccountOpened(uint256 indexed accountId, uint256 collateral);
    event HedgeExecuted(uint256 indexed marketId, bool indexed open, uint256 lots, uint256 limitPrice);

    error NotOwner(); error NotKeeper(); error ZeroAmount(); error TransferFailed();
    error InsufficientShares(); error InsufficientFreeAssets(); error PerplAccountMissing();
    error HedgeCapExceeded(); error PriceOutOfBand();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyKeeper() { if (msg.sender != keeper && msg.sender != owner) revert NotKeeper(); _; }

    constructor(address asset_, address perpl_, address owner_, address keeper_) {
        asset = IERC20Minimal(asset_);
        perpl = IPerplExchange(perpl_);
        owner = owner_;
        keeper = keeper_;
    }

    function totalAssets() public view returns (uint256) {
        uint256 held = asset.balanceOf(address(this));
        if (perplAccountId == 0) return held;
        IPerplExchange.AccountInfo memory account = perpl.getAccountById(perplAccountId);
        return held + account.balanceCNS + account.lockedBalanceCNS;
    }

    function deposit(uint256 assets) external returns (uint256 minted) {
        if (assets == 0) revert ZeroAmount();
        uint256 beforeAssets = totalAssets();
        minted = totalShares == 0 ? assets : assets * totalShares / beforeAssets;
        if (minted == 0) revert ZeroAmount();
        if (!asset.transferFrom(msg.sender, address(this), assets)) revert TransferFailed();
        shares[msg.sender] += minted;
        totalShares += minted;
        emit Deposit(msg.sender, assets, minted);
    }

    function withdraw(uint256 shareAmount) external returns (uint256 assets) {
        if (shareAmount == 0) revert ZeroAmount();
        if (shares[msg.sender] < shareAmount) revert InsufficientShares();
        assets = shareAmount * totalAssets() / totalShares;
        if (asset.balanceOf(address(this)) < assets) revert InsufficientFreeAssets();
        shares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;
        if (!asset.transfer(msg.sender, assets)) revert TransferFailed();
        emit Withdraw(msg.sender, assets, shareAmount);
    }

    function setKeeper(address nextKeeper) external onlyOwner { keeper = nextKeeper; emit KeeperSet(nextKeeper); }
    function setMaxHedgeLots(uint256 marketId, uint256 lots) external onlyOwner { maxHedgeLots[marketId] = lots; }
    function setMaxHedgeSlippageBps(uint256 bps) external onlyOwner { require(bps >= 10 && bps <= 1_000, "bounds"); maxHedgeSlippageBps = bps; }

    function openPerplAccount(uint256 collateral) external onlyKeeper returns (uint256 accountId) {
        if (perplAccountId != 0) revert PerplAccountMissing();
        if (asset.balanceOf(address(this)) < collateral) revert InsufficientFreeAssets();
        if (!asset.approve(address(perpl), 0) || !asset.approve(address(perpl), collateral)) revert TransferFailed();
        accountId = perpl.createAccount(collateral);
        perplAccountId = accountId;
        emit PerplAccountOpened(accountId, collateral);
    }

    function fundPerpl(uint256 collateral) external onlyKeeper {
        if (perplAccountId == 0) revert PerplAccountMissing();
        if (asset.balanceOf(address(this)) < collateral) revert InsufficientFreeAssets();
        if (!asset.approve(address(perpl), 0) || !asset.approve(address(perpl), collateral)) revert TransferFailed();
        perpl.depositCollateral(collateral);
    }

    function defundPerpl(uint256 collateral) external onlyKeeper {
        if (perplAccountId == 0) revert PerplAccountMissing();
        perpl.withdrawCollateral(collateral);
    }

    function hedge(uint256 marketId, bool open, uint256 lots, uint256 limitPrice) external onlyKeeper {
        if (perplAccountId == 0) revert PerplAccountMissing();
        uint256 cap = maxHedgeLots[marketId];
        if (cap == 0 || lots > cap) revert HedgeCapExceeded();
        IPerplExchange.PerpetualInfo memory info = perpl.getPerpetualInfo(marketId);
        uint256 oracle = info.oraclePNS;
        uint256 band = oracle * maxHedgeSlippageBps / 10_000;
        if (oracle == 0 || (open && limitPrice < oracle - band) || (!open && limitPrice > oracle + band)) revert PriceOutOfBand();
        perpl.execOrder(IPerplExchange.OrderDesc({
            orderDescId: block.number, perpId: marketId, orderType: open ? 1 : 3, orderId: 0,
            pricePNS: limitPrice, lotLNS: lots, expiryBlock: 0, postOnly: false,
            fillOrKill: false, immediateOrCancel: true, maxMatches: 0, leverageHdths: 100,
            lastExecutionBlock: block.number + 20, amountCNS: 0, maxNegPnlCollatBPS: 300
        }));
        emit HedgeExecuted(marketId, open, lots, limitPrice);
    }
}
