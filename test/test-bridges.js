const assert = require('assert');
require('dotenv').config()

const HDWalletProvider = require('truffle-hdwallet-provider')
const Web3 = require("web3");
const optionsLoader = require('../src/lib/optionsLoader');

const SampleERC20 = require("../../erc20-bridge/build/contracts/SampleERC20.json");
const HomeBridge = require("../../erc20-bridge/build/contracts/HomeBridge.json");
const ForeignBridge = require("../../erc20-bridge/build/contracts/ForeignBridge.json");

// Config is provided through environment variables (or .env file)

const options = {
  HOME_TOKEN: process.env.HOME_TOKEN,
  FOREIGN_TOKEN: process.env.FOREIGN_TOKEN,
  ...optionsLoader()
};

// Connections
const connections = {
  home: new Web3(new HDWalletProvider(
    options.HOME_SEED,
    options.HOME_URL
  )),
  foreign: new Web3(new HDWalletProvider(
    options.FOREIGN_SEED,
    options.FOREIGN_URL
  ))
}
const homeWeb3 = connections.home;
const foreignWeb3 = connections.foreign;

// Test accounts
let alice;

// ERC20 Tokens
let homeToken;
let foreignToken;

// Bridges
let homeBridge;
let foreignBridge;

// Utility functions
const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollForEvents(contract, eventName, filter={}, fromBlock) {
  let events = [];
  while (events.length == 0) {
    events = await contract.getPastEvents(eventName, {
      filter,
      fromBlock,
      toBlock: 'latest'
    });
    await timeout(2e3);
  }
  return events;
}

async function waitForEvent ({contract, event, filter, fromBlock, timeoutMs=60e3}) {
  const res = await Promise.race([
    pollForEvents(contract, event, filter, fromBlock),
    timeout(timeoutMs)
  ]);
  if (!res) {
    throw new Error("event polling timeout");
  }
  return res[res.length -1];
}

async function catchSignaturesUntilGrant(bridge, fromBlock, _transactionHash) {
  const filter = { _transactionHash };

  await waitForEvent({
    contract: bridge,
    event: "WithdrawRequestGranted",
    fromBlock,
    filter
  });

  // Collect signatures
  const signatures = new Map();
  const events = await pollForEvents(bridge, "WithdrawRequestSigned", filter, fromBlock);
  for (const { returnValues } of events) {
    signatures.set(returnValues._signer, returnValues);
  }

  const v = [];
  const r = [];
  const s = [];
  let withdrawBlock;

  signatures.forEach(signature => {
    withdrawBlock = signature._withdrawBlock;
    v.push(signature._v);
    r.push(signature._r);
    s.push(signature._s);
  })

  if (v.length < 1) {
    throw new Error("Withdraw was granted but no signatures were found");
  }

  return {v, r, s, withdrawBlock};
}

async function getBalance(token, address, from=address) {
  const val = await token.methods.balanceOf(address).call({ from }) 
  return parseInt(val);
}

// Tests
describe('Test bridge', function () {
  before('Setup accounts', async function () {
    alice = (await homeWeb3.eth.getAccounts())[0];
  });

  before('Setup token contracts', async function () {
    homeToken = await new homeWeb3.eth.Contract(SampleERC20.abi, options.HOME_TOKEN);
    foreignToken = await new foreignWeb3.eth.Contract(SampleERC20.abi, options.FOREIGN_TOKEN);
  });

  before('Setup bridge contracts', async function () {
    homeBridge = await new homeWeb3.eth.Contract(HomeBridge.abi, options.HOME_BRIDGE);
    foreignBridge = await new foreignWeb3.eth.Contract(ForeignBridge.abi, options.FOREIGN_BRIDGE);
  });

  it("should transfer alice's tokens from home to foreign net", async function () {
    const amount = 10;

    const homeBalance = await getBalance(homeToken, alice); 
    const foreignBalance = await getBalance(foreignToken, alice); 
    const homeBridgeBalance = await getBalance(homeToken, homeBridge._address, alice); 

    assert.ok(homeBalance >= amount, "Alice shouldn have enough tokens to transfer");

    const foreignBlockNumber = await foreignWeb3.eth.getBlockNumber();

    await homeToken.methods.transfer(homeBridge._address, amount).send({ from: alice });

    await waitForEvent({
      contract: foreignBridge,
      event: "MintRequestExecuted",
      fromBlock: foreignBlockNumber,
      filter: { _recipient: alice, _mainToken: homeToken, _amount: amount }
    })

    assert.equal(await getBalance(homeToken, alice), homeBalance - amount,
      "Alice should have `amount` less tokens than before on home net")

    assert.equal(await getBalance(foreignToken, alice), foreignBalance + amount,
      "Alice should have `amount` more tokens than before on foreign")

    assert.equal(await getBalance(homeToken, homeBridge._address, alice), homeBridgeBalance + amount,
      "Home bridge should have `amount` more tokens than before")
  })

  it("should transfer alice's tokens from foreign to home net", async function () {
    const amount = 1;

    const homeBalance = await getBalance(homeToken, alice); 
    const foreignBalance = await getBalance(foreignToken, alice); 
    const foreignBridgeBalance = await getBalance(foreignToken, homeBridge._address, alice); 

    assert.ok(foreignBalance >= amount, "Alice shouldn have enough tokens to transfer");

    const foreignBlockNumber = await foreignWeb3.eth.getBlockNumber();
    const homeBlockNumber = await homeWeb3.eth.getBlockNumber();

    const tx = await foreignToken.methods.transfer(foreignBridge._address, amount).send({ from: alice });

    // Receive signatures until granted
    const signatures = await catchSignaturesUntilGrant(foreignBridge, foreignBlockNumber, tx.transactionHash);

    const call = homeBridge.methods
      .withdraw(homeToken._address, alice, amount, signatures.withdrawBlock, signatures.v, signatures.r, signatures.s);

    await call.send({
      from: alice,
      gas: Math.ceil(await call.estimateGas() * 2),
      gasPrice: await homeWeb3.eth.getGasPrice(),
    })


    // Wait until hometoken is transfered to alice
    await waitForEvent({
      contract: homeToken,
      event: "Transfer",
      fromBlock: homeBlockNumber,
      filter: { to: alice, value: amount }
    })

    assert.equal(await getBalance(homeToken, alice), homeBalance + amount,
      "Alice should have `amount` more tokens than before on home net")

    assert.equal(await getBalance(foreignToken, alice), foreignBalance - amount,
      "Alice should have `amount` less tokens than before on foreign")

    assert.equal(await getBalance(foreignToken, foreignBridge._address, alice), foreignBridgeBalance,
      "Foreign bridge should have the same amount as before (tokens should be burned)")
  })

  after(async function () {
    // Process will not quit because Web3 is still listening and cant be stopped
    setTimeout(() =>  process.exit(0), 500)
  })
})