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

}