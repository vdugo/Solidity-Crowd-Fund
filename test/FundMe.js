const { ethers, network } = require('hardhat')
const { assert, expect } = require('chai')

getCurrentTime = async () =>
{
    let currentBlock = await ethers.provider.getBlock()
    return currentBlock.timestamp
}

describe('FundMe Unit Tests', async () =>
{
    
    const TOKEN_NAME = 'Vincent'
    const TOKEN_SYMBOL = 'VIN'

    // 1000 of any ERC-20 token with default 18 decimal places
    const GOAL = ethers.utils.parseUnits('1000')

    const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60

    const DONATION_AMOUNT = ethers.utils.parseEther('0.1')

    let erc20, ERC20, fundMe, FundMe

    let deployer, donor

    let transaction

    let testStartBlock

    beforeEach(async () =>
    {
        testStartBlock = await ethers.provider.getBlock()

        const accounts = await ethers.getSigners()
        deployer = accounts[0]
        donor = accounts[1]

        ERC20 = await ethers.getContractFactory("ERC20", deployer)
        FundMe = await ethers.getContractFactory("FundMe", deployer)

        erc20 = await ERC20.deploy(TOKEN_NAME, TOKEN_SYMBOL)
        fundMe = await FundMe.deploy(erc20.address)
    })

    describe('constructor', async () =>
    {
        it('initializes the token state variable to the ERC20 token', async () =>
        {
            const tokenAddress = await fundMe.token()
            assert(erc20.address === tokenAddress, 'token not initialized properly to Fund')
        })
    })

    describe('launch', async () =>
    {
        it('rejects an invalid starting time', async () =>
        {
            let currentTime = await getCurrentTime()
            await expect(fundMe.launch(GOAL, currentTime - 1, currentTime + 10000)).to.be.revertedWith('start at < current time')
        })

        it('rejects an invalid ending time', async () =>
        {
            let currentTime = await getCurrentTime()
            await expect(fundMe.launch(GOAL, currentTime + 10, currentTime - 10)).to.be.revertedWith('end at < start at')
        })

        it('enforces time limit of 90 days on how long the campaign can last', async () =>
        {
            let currentTime = await getCurrentTime()
            await expect(fundMe.launch(GOAL, currentTime + 10, currentTime + NINETY_DAYS_IN_SECONDS + 10)).to.be.revertedWith('end at > max duration')
        })

        it('increments the count state variable', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()
            assert(count.toString() === '1', 'count.toString() !== 1')
        })

        it('stores the campaign struct in the campaigns mapping', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()

            const campaign = await fundMe.campaigns(count)

            assert(campaign.creator.toString() === deployer.address)
            assert(campaign.goal.toString() === GOAL.toString())
            assert(campaign.pledged.toString() === '0')
            assert(campaign.startAt.toString() === (currentTime + 10).toString())
            assert(campaign.endAt.toString() === (currentTime + 10000).toString())
            assert(campaign.claimed === false)
        })

        it('emits a Launch event', async () =>
        {
            let currentTime = await getCurrentTime()
            expect(await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)).to.emit('Launch')
        })
    })

    describe('cancel', () => 
    {
        it('only lets the campaign creator cancel', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()

            await expect(fundMe.connect(donor).cancel(count)).to.be.revertedWith('not creator')
        })

        it('only allows cancellation if the campaign has not started yet', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [3600])

            await expect(fundMe.cancel(count)).to.be.revertedWith('campaign already started')
        })

        it('deletes the campaign struct in the campaigns mapping', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()
            await fundMe.cancel(count)

            const campaign = await fundMe.campaigns(count)

            assert(campaign.creator.toString().startsWith('0x'))
            assert(campaign.goal.toString() === '0')
            assert(campaign.pledged.toString() === '0')
            assert(campaign.startAt.toString() === '0')
            assert(campaign.endAt.toString() === '0')
            assert(campaign.claimed === false)
        })

        it('emits a Cancel event', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 10000)

            let count = await fundMe.count()
            expect(await fundMe.cancel(count)).to.emit('Cancel')
        })
    })
})