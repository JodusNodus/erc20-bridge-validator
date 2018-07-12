const assert = require('assert');
require('dotenv').config()

const Web3 = require("web3");

const SampleERC20 = require("../../erc20-bridge/build/contracts/SampleERC20.json");
const HomeBridge = require("../../erc20-bridge/build/contracts/HomeBridge.json");
const ForeignBridge = require("../../erc20-bridge/build/contracts/ForeignBridge.json");

// Config is provided through environment variables (or .env file)
const envVars = ["MAINWS", "FOREIGNWS", "HOMEBRIDGE", "FOREIGNBRIDGE", "HOMETOKEN", "FOREIGNTOKEN"]
const env = process.env

const isMissingEnvVar = envVars.find(x => !env[x])
if (isMissingEnvVar) {
  console.error("Please provide a config .env file");
  process.exit(1);
}

// Connections
const providers = {
  home: new Web3.providers.WebsocketProvider(env.MAINWS),
  foreign: new Web3.providers.WebsocketProvider(env.FOREIGNWS)
}
const homeWeb3 = new Web3(providers.home);
const foreignWeb3 = new Web3(providers.foreign);

// Test accounts
let alice;
let charlie;

// ERC20 Tokens
let homeToken;
let foreignToken;

// Bridges
let homeBridge;
let foreignBridge;

// Utility functions
const timeout = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms));

const waitForEvent = (contract, event, timeout=30000) => new Promise(function (resolve, reject) {
  contract.once(event, (err, evt) => {
    if (err) {
      reject(err)
    } else {
      resolve(evt)
    }
  })
  setTimeout(() => reject(new Error("event timed out")), timeout)
})

async function getBalance(token, address, from=address) {
  const val = await token.methods.balanceOf(address).call({ from }) 
  return parseInt(val);
}

// Tests
describe('Test bridge', function () {
  before('Setup accounts', async function () {
    alice = (await homeWeb3.eth.getAccounts())[1];
    charlie = (await foreignWeb3.eth.getAccounts())[2];
  });

  before('Setup token contracts', async function () {
    homeToken = await new homeWeb3.eth.Contract(SampleERC20.abi, env.HOMETOKEN);
    foreignToken = await new foreignWeb3.eth.Contract(SampleERC20.abi, env.FOREIGNTOKEN);
  });

  before('Setup bridge contracts', async function () {
    homeBridge = await new homeWeb3.eth.Contract(HomeBridge.abi, env.HOMEBRIDGE);
    foreignBridge = await new foreignWeb3.eth.Contract(ForeignBridge.abi, env.FOREIGNBRIDGE);
  });

  describe('Home to Foreign', function () {
    before(async function() {

    })

    it("should transfer alice's tokens from home to foreign net", async function () {
      const amount = 1;

      const homeBalance = await getBalance(homeToken, alice); 
      const foreignBalance = await getBalance(foreignToken, alice); 
      const homeBridgeBalance = await getBalance(homeToken, homeBridge._address, alice); 

      await homeToken.methods.transfer(homeBridge._address, amount).send({ from: alice });

      await waitForEvent(foreignBridge, "MintRequestExecuted");

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

      await foreignToken.methods.transfer(foreignBridge._address, amount).send({ from: alice });

      // Wait until hometoken is transfered to alice
      let event;
      while (!event || event.returnValues.to.toLowerCase() !== alice.toLowerCase()) {
        event = await waitForEvent(homeToken, "Transfer");
      }

      assert.equal(await getBalance(homeToken, alice), homeBalance + amount,
        "Alice should have `amount` more tokens than before on home net")

      assert.equal(await getBalance(foreignToken, alice), foreignBalance - amount,
        "Alice should have `amount` less tokens than before on foreign")

      assert.equal(await getBalance(foreignToken, foreignBridge._address, alice), foreignBridgeBalance,
        "Foreign bridge should have the same amount as before (tokens should be burned)")
    })

  });

  after(async function () {
    // Process will not quit because Web3 is still listening and cant be stopped
    setTimeout(() =>  process.exit(0), 500)
  })
})