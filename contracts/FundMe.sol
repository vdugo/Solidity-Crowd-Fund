// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./ERC20.sol";

/**
 * @dev A crowd funding contract for ERC-20 tokens.
 * Each campaign can only accept one ERC-20 token for better security.
 * Users of the contract can launch a campaign stating their goal (how many tokens to raise).
 * While the campaign is running, donors will be able to pledge or unpledge
 * any amount of tokens. At the end of a campaign, if the amount of tokens raised
 * is greater than or equal to the goal, then the campaign creator will be able to
 * withdraw all the pledged tokens. If the amount of tokens raised is less than the goal
 * at the end of the campaign, then donors will be able to call the function refund() to
 * get their tokens back.
 */
contract FundMe
{
    /**
     * @dev Emitted when a campaign is launched by `creator`.
     * Here we are putting indexed on the creator so that we can find all campaigns
     * that are launched by the same creator.
     */
    event Launch(uint256 id, address indexed creator, uint256 goal, uint32 startAt, uint32 endAt);

    /**
     * @dev Emitted when a campaign is cancelled by the creator of that campaign.
     */
    event Cancel(uint256 id);
    /**
     * @dev Emitted when a `donor` pledges `amount` tokens to campaign with id `id`.
     * Here we are using indexed for id because many donors will be able to pledge to
     * the same campaign. Also for donor because the same donor can pledge to many campaigns.
     */
    event Pledge(uint256 indexed id, address indexed donor, uint256 amount);

    /**
     * @dev Emitted when a `donor` unpledges `amount` tokens from campaign with id `id`.
     */
    event Unpledge(uint256 indexed id, address indexed donor, uint256 amount);

    /**
     * @dev Emitted when the creator of a campaign successfully claims the tokens after
     * a campaign has ended.
     */
    event Claim(uint256 id);

    /**
     * @dev Emitted when a `donor` receives a refund of `amount` from campaign with id `id`.
     *  This will only work if a campaign goal amount was not reached.
     */
    event Refund(uint256 indexed id, address indexed donor, uint256 amount);

    /**
     * @dev Stores the data of each campaign. Notice the use of uint32 instead
     * of uint256, uint32 can hold times up to about 100 years from now in Unix time.
     * We don't need more bits than 32.
     */
    struct Campaign
    {
        address creator; /// the address of the creator of a campaign
        uint256 goal; /// the target amount of tokens that the creator wishes to raise from donors
        uint256 pledged; /// the amount currently pledged to a campaign by all the donors
        uint32 startAt; /// the starting time of the campaign in Unix time
        uint32 endAt; /// the ending time of the campaign in Unix time
        bool claimed; /// boolean to check if the creator has claimed the tokens
    }
    /**
     * State Variables
     */
    /// token will only be set once on creation
    IERC20 public immutable token; 
    /// counter so that we can generate a unique id for every campaign
    uint256 public count; 
    /// mapping from id of campaign to the campaign
    mapping(uint256 => Campaign) public campaigns; 
    /// mapping from campaign id to another mapping from donor address to amount donated
    mapping(uint256 => mapping(address => uint256)) public pledgedAmount;

    constructor(address _token)
    {
        token = IERC20(_token);
    }
    /**
     * @dev Launches a campaign
     * @param _goal The goal amount of tokens that the creator wants to raise
     * @param _startAt The start time of the campaign in Unix time
     * @param _endAt The end time of the campaign in Unix time
     */
    function launch(uint256 _goal, uint32 _startAt, uint32 _endAt) external
    {
        // check that the start time is now or later
        require(_startAt >= block.timestamp, "start at < current time");
        // check that the end time is later than the start time
        require(_endAt >= _startAt, "end at < start at");
        // put a limit of 90 days on how long the campaign can last
        require(_endAt <= block.timestamp + 90 days, "end at > max duration");

        count += 1;
        campaigns[count] = Campaign({
            creator: msg.sender,
            goal: _goal,
            pledged: 0,
            startAt: _startAt,
            endAt: _endAt,
            claimed: false
        });

        emit Launch(count, msg.sender, _goal, _startAt, _endAt);
    }
    /**
     * @dev Cancels a campaign if the creator of that campaign calls this function
     * also, can only be cancelled if the campaign has not started yet.
     * @param _id The id of the campaign to be cancelled
     */
    function cancel(uint256 _id) external
    {
        Campaign memory campaign = campaigns[_id];
        // make sure that someone trying to cancel a campaign is the creator of that campaign
        require(msg.sender == campaign.creator, "not creator");
        // check that the campaign has not started already
        require(block.timestamp < campaign.startAt, "campaign already started");
        delete campaigns[_id];
        emit Cancel(_id);
    }
    /**
     * @dev Once a campaign starts, donors will be able to pledge tokens to the
     * campaign. 
     */
    function pledge(uint256 _id, uint256 _amount) external
    {
        // we need to use storage because we will be updating the
        // campaign struct of the campaign with _id
        Campaign storage campaign = campaigns[_id];
        // require that the campaign has started
        require(block.timestamp >= campaign.startAt, "campaign not started");
        // require that the campaign has not ended
        require(block.timestamp <= campaign.endAt, "campaign has ended");

        campaign.pledged += _amount;
        // need to keep track of how many tokens a donor has pledged using 
        // pledgedAmount mapping in case the campaign was unsuccessful
        pledgedAmount[_id][msg.sender] += _amount;
        // transfer the tokens from the donor to this contract for the amount of tokens
        token.transferFrom(msg.sender, address(this), _amount);

        emit Pledge(_id, msg.sender, _amount);
    }
    /**
     * @dev If the campaign has not ended, then donors can choose to unpledge
     * any amount of tokens from that campaign.
     */
    function unpledge(uint256 _id, uint256 _amount) external
    {
        // we need to use storage because we will be updating the
        // campaign struct of the campaign with _id
        Campaign storage campaign = campaigns[_id];
        // donors shouldn't be able to unpledge from a campaign that has ended
        require(block.timestamp <= campaign.endAt, "campaign has ended");
        // check that the donor has enough tokens pledged
        require(pledgedAmount[_id][msg.sender] >= _amount);

        campaign.pledged -= _amount;
        pledgedAmount[_id][msg.sender] -= _amount;
        token.transfer(msg.sender, _amount);
        emit Unpledge(_id, msg.sender, _amount);
    }
    /**
     * @dev Once a campaign goal is reached, that is, the total amount pledged
     * to that campaign is >= goal, then the campaign create is able to claim the
     * tokens for that campaign.
     */
    function claim(uint256 _id) external
    {
        Campaign storage campaign = campaigns[_id];
        require(msg.sender == campaign.creator, "not creator");
        // check that the campaign has ended
        require(block.timestamp > campaign.endAt, "campaign has not ended");
        // check that the total amount pledged to this campaign is >= goal
        require(campaign.pledged >= campaign.goal, "pledged < goal");
        // check that claim has not already been called
        require(!campaign.claimed, "claimed");

        campaign.claimed = true;
        token.transfer(msg.sender, campaign.pledged);

        emit Claim(_id);
    }
    /**
     * If the campaign was unsuccessful, that is, the total amount pledged < goal,
     * then donors will be able to get a refund.
     */
    function refund(uint256 _id) external
    {
        Campaign storage campaign = campaigns[_id];
        // check that the campaign has ended
        require(block.timestamp > campaign.endAt, "campaign has not ended");
        // check that the total amount pledged to this campaign is < goal
        // if this is true then the campaign did not reach its funding goal,
        // so donors are entitled to a refund.
        require(campaign.pledged < campaign.goal, "pledged < goal");

        // get the amount that the donor has pledged
        uint256 balance = pledgedAmount[_id][msg.sender];
        // reset that amount to 0
        pledgedAmount[_id][msg.sender] = 0;
        // transfer that balance back to the donor
        token.transfer(msg.sender, balance);

        emit Refund(_id, msg.sender, balance);
    }

}