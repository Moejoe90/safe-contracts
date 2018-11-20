const utils = require('./utils')

const CreateAndAddModules = artifacts.require("./libraries/CreateAndAddModules.sol");
const DutchXModule = artifacts.require("./DutchXModule.sol");
const GnosisSafe = artifacts.require("./GnosisSafe.sol");
const ProxyFactory = artifacts.require("./ProxyFactory.sol");
const safeUtils = require('./utilsPersonalSafe')


contract('DutchXModule', function(accounts) {

    const dxAddress = "0xaf1745c0f8117384dfa5fff40f824057c70f2ed3" // This address doesn't matter, we are just testing the module, not the integration
    const GNOAddress = "0x6810e776880c02933d47db1b9fc05908e5386b96" // This address doesn't matter neither, we are just testing the module, not the integration
    let gnosisSafe
    let dxModule
    let lw

    const CALL = 0

    beforeEach(async function () {
        // Create lightwallet
        lw = await utils.createLightwallet()
        // Create Master Copies
        let proxyFactory = await ProxyFactory.new()
        let createAndAddModules = await CreateAndAddModules.new()
        let gnosisSafeMasterCopy = await GnosisSafe.new()
        // Initialize safe master copy
        gnosisSafeMasterCopy.setup([accounts[0], accounts[1]], 2, 0, "0x")
        let dxModuleCopy = await DutchXModule.new( [])
        // Create Gnosis Safe and DutchX Module in one transaction
        let moduleData = await dxModuleCopy.contract.setup.getData(dxAddress, [GNOAddress]) // dx, whitelistedToken
        let proxyFactoryData = await proxyFactory.contract.createProxy.getData(dxModuleCopy.address, moduleData)
        let modulesCreationData = utils.createAndAddModulesData([proxyFactoryData])
        let createAndAddModulesData = createAndAddModules.contract.createAndAddModules.getData(proxyFactory.address, modulesCreationData)
        let gnosisSafeData = await gnosisSafeMasterCopy.contract.setup.getData([lw.accounts[0], lw.accounts[1], accounts[1]], 2, createAndAddModules.address, createAndAddModulesData)
        gnosisSafe = utils.getParamFromTxEvent(
            await proxyFactory.createProxy(gnosisSafeMasterCopy.address, gnosisSafeData),
            'ProxyCreation', 'proxy', proxyFactory.address, GnosisSafe, 'create Gnosis Safe and DutchX Module',
        )
        let modules = await gnosisSafe.getModules()
        dxModule = DutchXModule.at(modules[0])
        assert.equal(await dxModule.manager.call(), gnosisSafe.address)
    })

    it.only('should execute approve tokens and deposit for whitelisted token in the dx', async () => {
        let token = await safeUtils.deployToken(accounts[0]); // token is not whitelisted yet

        let totalSupply = (await token.balances(accounts[0])).toNumber();
        await token.transfer(gnosisSafe.address, totalSupply, {from: accounts[0]});

        // total amount of tokens are in the safe contract
        assert.equal(await (await token.balances(accounts[0])).toNumber(), 0);
        assert.equal(await (await token.balances(gnosisSafe.address)).toNumber(), totalSupply);
    })

    // it('should execute a withdraw transaction to a whitelisted account', async () => {
    //     // Withdraw to whitelisted account should fail as we don't have funds
    //     await utils.assertRejects(
    //         whitelistModule.executeWhitelisted(
    //             accounts[3], 300, "0x", {from: accounts[1]}
    //         ),
    //         "Not enough funds"
    //     )
    //     // Deposit 1 eth
    //     await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.toWei(1, 'ether')})
    //     assert.equal(await web3.eth.getBalance(gnosisSafe.address).toNumber(), web3.toWei(1, 'ether'));
    //     // Withdraw to whitelisted account
    //     utils.logGasUsage(
    //         'execTransactionFromModule withdraw to whitelisted account',
    //         await whitelistModule.executeWhitelisted(
    //             accounts[3], 300, "0x", {from: accounts[1]}
    //         )
    //     )
    //     assert.equal(await web3.eth.getBalance(gnosisSafe.address).toNumber(), web3.toWei(1, 'ether') - 300);
    // })

    // it('should add and remove an account from the whitelist', async () => {
    //     assert.equal(await whitelistModule.isWhitelisted(accounts[1]), false)
    //     // Add account 3 to whitelist
    //     let data = await whitelistModule.contract.addToWhitelist.getData(accounts[1])
    //     let nonce = await gnosisSafe.nonce()
    //     let transactionHash = await gnosisSafe.getTransactionHash(whitelistModule.address, 0, data, CALL, 0, 0, 0, 0, 0, nonce)
    //     let sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
    //     utils.logGasUsage(
    //         'execTransaction add account to whitelist',
    //         await gnosisSafe.execTransaction(
    //             whitelistModule.address, 0, data, CALL, 0, 0, 0, 0, 0, sigs
    //         )
    //     )
    //     assert.equal(await whitelistModule.isWhitelisted(accounts[1]), true)
    //     // Remove account 3 from whitelist
    //     data = await whitelistModule.contract.removeFromWhitelist.getData(accounts[1])
    //     nonce = await gnosisSafe.nonce()
    //     transactionHash = await gnosisSafe.getTransactionHash(whitelistModule.address, 0, data, CALL, 0, 0, 0, 0, 0, nonce)
    //     sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
    //     utils.logGasUsage(
    //         'execTransaction remove account from whitelist',
    //         await gnosisSafe.execTransaction(
    //             whitelistModule.address, 0, data, CALL, 0, 0, 0, 0, 0, sigs
    //         )
    //     )
    //     assert.equal(await whitelistModule.isWhitelisted(accounts[1]), false)
    // })
});
