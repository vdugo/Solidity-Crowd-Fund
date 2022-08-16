const { ethers, network } = require('hardhat')
const { assert, expect } = require('chai')

describe('FundMe Unit Tests', async () =>
{
    
    const TOKEN_NAME = 'Vincent'
    const TOKEN_SYMBOL = 'VIN'

    const DONATION_AMOUNT = ethers.utils.parseEther('0.1')

    let erc20, ERC20, fundMe, FundMe

    let deployer, donor

    beforeEach(async () =>
    {
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
            assert(erc20.address === tokenAddress, 'token not initialized properly to FundMe')
        })
    })
})