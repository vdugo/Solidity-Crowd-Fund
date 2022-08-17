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
    const TOTAL_SUPPLY = 1000000

    // 1000 of any ERC-20 token with default 18 decimal places
    const GOAL = ethers.utils.parseEther('0.2')

    const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60

    const DONATION_AMOUNT = ethers.utils.parseEther('0.1')

    const SMALL_DONATION = ethers.utils.parseEther('0.01')

    let erc20, ERC20, fundMe, FundMe

    let deployer, donor, donor2

    let transaction

    let testStartBlock

    beforeEach(async () =>
    {
        testStartBlock = await ethers.provider.getBlock()

        const accounts = await ethers.getSigners()
        deployer = accounts[0]
        donor = accounts[1]
        donor2 = accounts[2]

        ERC20 = await ethers.getContractFactory("ERC20", deployer)
        FundMe = await ethers.getContractFactory("FundMe", deployer)

        erc20 = await ERC20.deploy(TOKEN_NAME, TOKEN_SYMBOL, TOTAL_SUPPLY)
        fundMe = await FundMe.deploy(erc20.address)

        // deployer address transfers tokens to the donor address
        await erc20.transfer(donor.address, DONATION_AMOUNT)
        await erc20.transfer(donor2.address, DONATION_AMOUNT)
        // donor approves the tokens for the FundMe contract
        await erc20.connect(donor).approve(fundMe.address, DONATION_AMOUNT)
        await erc20.connect(donor2).approve(fundMe.address, DONATION_AMOUNT)
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

    describe('pledge', async () =>
    {
        it('does not let donors pledge if the campaign has not started', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 3000, currentTime + 10000)

            let count = await fundMe.count()

            await expect(fundMe.connect(donor).pledge(count, DONATION_AMOUNT)).to.be.revertedWith('campaign not started')
        })

        it('only lets donors pledge if the campaign has not ended', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [3600])

            await expect(fundMe.connect(donor).pledge(count, DONATION_AMOUNT)).to.be.revertedWith('campaign has ended')
        })

        it('updates the campaign struct in the campaigns mapping to reflect the added pledge', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            let campaign = await fundMe.campaigns(count)

            assert(campaign.pledged.toString() === DONATION_AMOUNT.toString())
        })

        it('updates the pledgedAmount mapping', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            let amount = await fundMe.pledgedAmount(count, donor.address)

            assert(amount.toString() === DONATION_AMOUNT.toString())
        })

        it('transfers the tokens from the donor address to the contract address', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            let donorBalance = (await erc20.balanceOf(donor.address)).toString()

            let fundMeBalance = (await erc20.balanceOf(fundMe.address)).toString()

            assert(donorBalance === '0')
            assert(fundMeBalance === DONATION_AMOUNT.toString())

        })

        it('emits a Pledge event', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            expect(await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)).to.emit('Pledge')
        })
    })

    describe('unpledge', async () =>
    {
        it('does not let donors unpledge if the campaign has ended', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 2000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [5000])

            await expect(fundMe.connect(donor).unpledge(count, DONATION_AMOUNT)).to.be.revertedWith('campaign has ended')
        })

        it('only allows the unpledge if the donor has enough tokens deposited', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 10, currentTime + 2000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await expect(fundMe.connect(donor).unpledge(count, DONATION_AMOUNT + 1)).to.be.revertedWith('not enough pledged')
        })

        it('updates the campaign struct in the campaigns mapping to reflect the subtracted pledge', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            await fundMe.connect(donor).unpledge(count, DONATION_AMOUNT)

            let campaign = await fundMe.campaigns(count)

            assert(campaign.pledged.toString() === '0')
        })

        it('updates the pledgedAmount mapping', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            await fundMe.connect(donor).unpledge(count, DONATION_AMOUNT)

            let amount = await fundMe.pledgedAmount(count, donor.address)

            assert(amount.toString() === '0')
        })

        it('transfers the tokens from the contract address to the donor address', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            await fundMe.connect(donor).unpledge(count, DONATION_AMOUNT)

            let donorBalance = (await erc20.balanceOf(donor.address)).toString()

            let fundMeBalance = (await erc20.balanceOf(fundMe.address)).toString()

            assert(donorBalance === DONATION_AMOUNT.toString())
            assert(fundMeBalance === '0')

        })

        it('emits an Unpledge event', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            let count = await fundMe.count()

            await network.provider.send("evm_increaseTime", [100])

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            expect(await fundMe.connect(donor).unpledge(count, DONATION_AMOUNT)).to.emit('Unpledge')
        })
    })

    describe('claim', async () =>
    {
        it('checks for the campaign creator', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            await expect(fundMe.connect(donor).claim(count)).to.be.revertedWith('not creator')
        })

        it('checks that the campaign has ended', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await expect(fundMe.claim(count)).to.be.revertedWith('campaign has not ended')
        })

        it('checks that the total amount pledged to the campaign is >= goal', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            await expect(fundMe.claim(count)).to.be.revertedWith('pledged < goal')
        })

        it('sets the claimed boolean variable to true in the campaign struct', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            await fundMe.claim(count)

            let campaign = await fundMe.campaigns(count)

            assert(campaign.claimed === true)
        })

        it('transfers the tokens from the contract address to the campaign creator address', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            await fundMe.claim(count)

            let campaignCreatorBalance = (await erc20.balanceOf(deployer.address)).toString()

            let totalSupply = ethers.utils.parseUnits(TOTAL_SUPPLY.toString())

            assert(campaignCreatorBalance === totalSupply.toString())
        })

        it('emits a Claim event', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            expect(await fundMe.claim(count)).to.emit('Claim')
        })
    })

    describe('refund', async () =>
    {
        it('checks that the campaign has ended', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, SMALL_DONATION)
            await fundMe.connect(donor2).pledge(count, SMALL_DONATION)

            await expect(fundMe.connect(donor).refund(count)).to.be.revertedWith('campaign has not ended')
        })

        it('checks that the total pledged amount is less than the goal', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, DONATION_AMOUNT)
            await fundMe.connect(donor2).pledge(count, DONATION_AMOUNT)

            await network.provider.send("evm_increaseTime", [2000])

            await expect(fundMe.connect(donor).refund(count)).to.be.revertedWith('pledged amount reached goal')
        })

        it('gets the amount of tokens that the donor donated from the amountPledged mapping', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, SMALL_DONATION)
            await fundMe.connect(donor2).pledge(count, SMALL_DONATION)

            await network.provider.send("evm_increaseTime", [2000])

            let balance = await fundMe.pledgedAmount(count, donor.address)

            assert(balance.toString() === SMALL_DONATION.toString())
        })

        it('resets the pledgedAmount mapping and sends the tokens to the donor that withdrew', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, SMALL_DONATION)
            await fundMe.connect(donor2).pledge(count, SMALL_DONATION)

            await network.provider.send("evm_increaseTime", [2000])

            await fundMe.connect(donor).refund(count)

            let contractBalance = await fundMe.pledgedAmount(count, donor.address)

            let tokenBalance = await erc20.balanceOf(donor.address)

            assert(contractBalance.toString() === '0')
            assert(tokenBalance.toString() === DONATION_AMOUNT.toString())
        })

        it('emits a Refund event', async () =>
        {
            let currentTime = await getCurrentTime()
            await fundMe.launch(GOAL, currentTime + 5, currentTime + 1000)

            await network.provider.send("evm_increaseTime", [100])

            let count = await fundMe.count()

            await fundMe.connect(donor).pledge(count, SMALL_DONATION)
            await fundMe.connect(donor2).pledge(count, SMALL_DONATION)

            await network.provider.send("evm_increaseTime", [2000])

            expect(await fundMe.connect(donor).refund(count)).to.emit('Refund')
        })
    })
})