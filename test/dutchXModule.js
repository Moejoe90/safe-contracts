const utils = require('./utils')

const CreateAndAddModules = artifacts.require("./libraries/CreateAndAddModules.sol");
const DutchXModule = artifacts.require("./DutchXModule.sol");
const GnosisSafe = artifacts.require("./GnosisSafe.sol");
const ProxyFactory = artifacts.require("./ProxyFactory.sol");
const safeUtils = require('./utilsPersonalSafe')


contract('DutchXModule', function(accounts) {

    const dxAddress = "0xaf1745c0f8117384dfa5fff40f824057c70f2ed3" // This address doesn't matter, we are just testing the module, not the integration
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
        // Initialize safe master copy with accounts[0] and accounts[1] as owners and 2 required confirmations
        gnosisSafeMasterCopy.setup([accounts[0], accounts[1]], 2, 0, "0x")
        let dxModuleCopy = await DutchXModule.new( [])
        // Create Gnosis Safe and DutchX Module in one transaction
        let moduleData = await dxModuleCopy.contract.setup.getData(dxAddress, [], [accounts[0]]) // dx, whitelistedToken, operators
        let proxyFactoryData = await proxyFactory.contract.createProxy.getData(dxModuleCopy.address, moduleData)
        let modulesCreationData = utils.createAndAddModulesData([proxyFactoryData])
        let createAndAddModulesData = createAndAddModules.contract.createAndAddModules.getData(proxyFactory.address, modulesCreationData)
        // Initialize safe proxy with lightwallet accounts as owners and also accounts[1], note that only lightwallet accounts can sign messages without prefix
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
        let token = await safeUtils.deployWETHToken(accounts[0]); // token is not whitelisted yet

        // send tokens to the safe and 1 ETH
        let totalSupply = (await token.balances(accounts[0])).toNumber();
        await token.transfer(gnosisSafe.address, totalSupply, {from: accounts[0]});
        await web3.eth.sendTransaction({from: accounts[0], to: gnosisSafe.address, value: web3.toWei(1, 'ether')})

        // total amount of tokens are in the safe contract
        assert.equal(await (await token.balances(accounts[0])).toNumber(), 0);
        assert.equal(await (await token.balances(gnosisSafe.address)).toNumber(), totalSupply);
        assert.equal(await (await web3.eth.getBalance(gnosisSafe.address)).toNumber(), web3.toWei(1, 'ether'));

        // safe contract has the tokens, module is set up correctly, but none whitelisted token
        // if we try to execute any function, will fail, none token defined.
        // MethodID for deposit()
        const depositWETHData = token.deposit.getData()
        utils.assertRejects(
            dxModule.executeWhitelisted(
                token.address, web3.toWei(1, 'ether'), depositWETHData, {from: accounts[0]}
            ),
            'execTransactionFromModule deposit WETH fails'
        )
        
        // addWhitelist must come from the safe contract
        // regular tx from owner accounts will fail
        utils.assertRejects(
            dxModule.addToWhitelist(token.address, {from: accounts[0]}),
            'Whitelist token'
        )

        // from the safe works
        let data = await dxModule.contract.addToWhitelist.getData(token.address)
        let nonce = await gnosisSafe.nonce()
        let transactionHash = await gnosisSafe.getTransactionHash(dxModule.address, 0, data, CALL, 0, 0, 0, 0, 0, nonce)
        let sigs = utils.signTransaction(lw, [lw.accounts[0], lw.accounts[1]], transactionHash)
        utils.logGasUsage(
            'execTransaction add account to whitelist',
            await gnosisSafe.execTransaction(
                dxModule.address, 0, data, CALL, 0, 0, 0, 0, 0, sigs
            )
        )
        assert.equal(await dxModule.isWhitelistedToken(token.address), true)

        // No operator user will fail
        utils.assertRejects(
            dxModule.executeWhitelisted(token.address, web3.toWei(1, 'ether'), depositWETHData, {from: accounts[1]}),
            'no operator fail to execute from module'
        )

        utils.logGasUsage(
            'execTransactionFromModule deposit WETH',
            await dxModule.executeWhitelisted(
                token.address, web3.toWei(1, 'ether'), depositWETHData, {from: accounts[0]}
            )
        )
    })
});
