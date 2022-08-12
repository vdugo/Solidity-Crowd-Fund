// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./IERC20.sol";

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

}