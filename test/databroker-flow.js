const assert = require('assert');
require('dotenv').config()

const HDWalletProvider = require('truffle-hdwallet-provider')
const Web3 = require("web3");
const optionsLoader = require('../src/lib/optionsLoader');

const DTXToken = require("../../erc20-bridge/build/contracts/DTXToken.json");
const ForeignBridge = require("../../erc20-bridge/build/contracts/ForeignBridge.json");

const { getBalance, catchSignaturesUntilGrant, waitForEvent } = require("./utils");

const options = {
  BRIDGE_OWNER: 'puppy firm kit zero jelly script update alter ring rail zero gasp crawl meat know',
  TEST_ACCOUNT_SEED: process.env.TEST_ACCOUNT_SEED,
  RECIPIENT: '0xd88457e2f87951f68fc56acf4b2fa0e249b3f19b',
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
    options.TEST_ACCOUNT_SEED,
    options.FOREIGN_URL
  ))
}
const homeWeb3 = connections.home;
const foreignWeb3 = connections.foreign;

// Test accounts
let sender;
let recipient;

// ERC20 Tokens
let homeToken;
let foreignToken;

// Bridges
let foreignBridge;

describe('Test bridge', function () {
  before('Setup accounts', async function () {
    sender = (await homeWeb3.eth.getAccounts())[0];
    recipient = options.RECIPIENT;
    console.log("SENDER:", sender);
    console.log("RECIPIENT:", recipient);
  });

  before('Setup token contracts', async function () {
    homeToken = await new homeWeb3.eth.Contract(DTXToken.abi, options.HOME_TOKEN);
    foreignToken = await new foreignWeb3.eth.Contract(DTXToken.abi, options.FOREIGN_TOKEN);
  });

  before('Setup bridge contracts', async function () {
    foreignBridge = await new foreignWeb3.eth.Contract(ForeignBridge.abi, options.FOREIGN_BRIDGE);
  });

  it("should transfer alice's tokens from home to foreign net", async function () {
    const amount = 1;

    const homeSenderBalance = await getBalance(homeToken, sender); 
    const foreignRecipientBalance = await getBalance(foreignToken, recipient, sender); 

    assert.ok(homeSenderBalance >= amount, "Sender should have enough tokens to transfer");

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

    assert.equal(await getBalance(homeToken, sender), homeSenderBalance - amount,
      "Sender should have `amount` less tokens than before on home net");

    assert.equal(await getBalance(foreignToken, recipient, sender), foreignRecipientBalance + amount,
      "Recipient should have `amount` more tokens than before on foreign");
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
