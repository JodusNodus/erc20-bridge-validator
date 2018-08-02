const assert = require('assert');
require('dotenv').config()

const HDWalletProvider = require('truffle-hdwallet-provider')
const Web3 = require("web3");
const optionsLoader = require('../src/lib/optionsLoader');

const DTXToken = require("@settlemint/erc20-bridge/build/contracts/DTXToken.json");
const ForeignDTXToken = require("@settlemint/erc20-bridge/build/contracts/ForeignDTXToken.json");
const ForeignBridge = require("@settlemint/erc20-bridge/build/contracts/ForeignBridge.json");

const { getBalance, catchSignaturesUntilGrant, waitForEvent } = require("./utils");

const options = {
  BRIDGE_OWNER: 'puppy firm kit zero jelly script update alter ring rail zero gasp crawl meat know',
  TEST_ACCOUNT_SEED: process.env.TEST_ACCOUNT_SEED,
  TEST_ACCOUNT_SEED_2: process.env.TEST_ACCOUNT_SEED_2,
  HOME_TOKEN: process.env.HOME_TOKEN,
  FOREIGN_TOKEN: process.env.FOREIGN_TOKEN,
  ...optionsLoader()
};

// Connections
const connections = {
  home: new Web3(new HDWalletProvider(
    options.TEST_ACCOUNT_SEED,
    options.HOME_URL
  )),
  foreign: new Web3(new HDWalletProvider(
    options.TEST_ACCOUNT_SEED_2,
    options.FOREIGN_URL
  ))
}
const homeWeb3 = connections.home;
const foreignWeb3 = connections.foreign;

// Test accounts
let homeAccount;
let foreignAccount;

// ERC20 Tokens
let homeToken;
let foreignToken;

// Bridges
let foreignBridge;

describe('Test bridge', function () {
  before('Setup accounts', async function () {
    homeAccount = (await homeWeb3.eth.getAccounts())[0];
    foreignAccount = (await foreignWeb3.eth.getAccounts())[0];
    console.log("Home Account:", homeAccount);
    console.log("Foreign Account:", foreignAccount);
  });

  before('Setup token contracts', async function () {
    homeToken = await new homeWeb3.eth.Contract(DTXToken.abi, options.HOME_TOKEN);
    foreignToken = await new foreignWeb3.eth.Contract(ForeignDTXToken.abi, options.FOREIGN_TOKEN);
  });

  before('Setup bridge contracts', async function () {
    foreignBridge = await new foreignWeb3.eth.Contract(ForeignBridge.abi, options.FOREIGN_BRIDGE);
  });

  it("should deposit tokens to foreign net", async function () {
    const sender = homeAccount;
    const recipient = foreignAccount;
    const amount = 1;

    const senderBalance = await getBalance(homeToken, sender); 
    const recipientBalance = await getBalance(foreignToken, recipient); 

    assert.ok(senderBalance >= amount, "Sender should have enough tokens to transfer");

    const allowance = await homeToken.methods.allowance(sender, options.HOME_BRIDGE).call();
    if (allowance > 0) {
      await resetApproval(homeWeb3, homeToken, options.HOME_BRIDGE, sender);
    }

    const tx = await approveDeposit(homeWeb3, homeToken, options.HOME_BRIDGE, sender, recipient, amount);

    await waitForEvent({
      contract: foreignBridge,
      event: "MintRequestExecuted",
      fromBlock: tx.blockNumber,
      filter: { _transactionHash: tx.transactionHash },
      timeoutMs: 5e5
    });

    assert.equal(await getBalance(homeToken, sender), senderBalance - amount,
      "Sender should have `amount` less tokens than before on home net");

    assert.equal(await getBalance(foreignToken, recipient, sender), recipientBalance + amount,
      "Recipient should have `amount` more tokens than before on foreign");
  })

  it("should withdraw tokens to home net", async function () {
    const sender = foreignAccount;
    const recipient = homeAccount;
    const amount = 1;

    const senderBalance = await getBalance(foreignToken, sender); 
    const recipientBalance = await getBalance(homeToken, recipient); 

    assert.ok(senderBalance >= amount, "Sender should have enough tokens to transfer");

    const tx = await foreignToken.methods.transferWithData(options.FOREIGN_BRIDGE, amount, recipient).send({ from: sender });

    // Receive signatures until granted
    const signatures = await catchSignaturesUntilGrant(foreignBridge, foreignBlockNumber, tx.transactionHash);

    const call = homeBridge.methods
      .withdraw(homeToken._address, recipient, amount, signatures.withdrawBlock, signatures.v, signatures.r, signatures.s);

    await call.send({
      from: recipient,
      gas: Math.ceil(await call.estimateGas() * 2),
      gasPrice: await homeWeb3.eth.getGasPrice(),
    })


    // Wait until hometoken is transfered to alice
    await waitForEvent({
      contract: homeToken,
      event: "Transfer",
      fromBlock: homeBlockNumber,
      filter: { to: recipient, value: amount }
    })

    assert.equal(await getBalance(homeToken, recipient), homeBalance + amount,
      "Alice should have `amount` more tokens than before on home net")

    assert.equal(await getBalance(foreignToken, sender), foreignBalance - amount,
      "Alice should have `amount` less tokens than before on foreign")
  })

  after(async function () {
    // Process will not quit because Web3 is still listening and cant be stopped
    setTimeout(() =>  process.exit(0), 500);
  })
})

async function resetApproval(web3, token, bridgeAddress, sender) {
  const call = token.methods.approve(bridgeAddress, 0);
  await call.send({
      from: sender,
      gasPrice: (await web3.eth.getGasPrice()),
      gas: (await call.estimateGas()) * 2
  });
}

async function approveDeposit(web3, token, bridgeAddress, from, receiver, amount) {
  const call = await token.methods.approveAndCall(bridgeAddress, amount, receiver);
  const gas = (await call.estimateGas({ from })) * 2;
  const gasPrice = (await web3.eth.getGasPrice()) * 2;
  return await call.send({
      from,
      gasPrice,
      gas
  });
}
