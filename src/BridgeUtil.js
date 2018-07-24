const logger = require("./logs")(module);
const EthereumTx = require("ethereumjs-tx");
const asyncIters = require("p-iteration");
const lodash = require("lodash");
let db;

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms));

class BridgeUtil {
  constructor(
    web3,
    contractInstance,
    defaultStartBlock,
    pollInterval,
    processEvent,
    rescan,
    dbscope
  ) {
    this.web3 = web3;
    this.contract = contractInstance;
    this.defaultStartBlock = defaultStartBlock;
    this.pollInterval = pollInterval;
    this.nextPollInterval = pollInterval;
    this.processEvent = processEvent;
    this.rescan = rescan;
    this.dbscope = dbscope;
    db = require("./db")(this.dbscope);
  }

  async startPolling() {
    logger.info("start polling contract %s", this.contract._address);
    if (typeof this.defaultStartBlock !== "number") {
      this.defaultStartBlock = await this.web3.eth.getBlockNumber();
    } else if (this.rescan) {
      logger.info("forcing rescan from startblock %d", this.defaultStartBlock);
      await this.setLastProcessedBlock(
        this.contract._address,
        this.defaultStartBlock
      );
    }

    this.pollLoop();
  }

  async pollLoop() {
    while (true) {
      await timeout(this.pollInterval);
      await this.poll();
    }
  }

  async poll() {
    let lastProccessedBlock = await this.getLastProcessedBlock(
      this.contract._address
    );
    lastProccessedBlock = lastProccessedBlock || this.defaultStartBlock - 1;

    const currentBlock = await this.web3.eth.getBlockNumber();

    if (currentBlock < lastProccessedBlock) {
      logger.warn(
        "chain blocknumber too low.. current = %d < lastprocesssed = %d (node not in sync?)",
        currentBlock,
        lastProccessedBlock
      );
      return;
    }
    const fromBlock = lastProccessedBlock + 1;
    let toBlock = currentBlock;

    // cap range to 10000
    if (toBlock - fromBlock > 10000) {
      toBlock = fromBlock + 10000;
    }

    // if (fromBlock === toBlock) {
    //   return;
    // }

    try {
      await this.processRange(this.contract, fromBlock, toBlock);
      // unless we're at the end of the chain - continue immediately
      if (toBlock < currentBlock) {
        this.nextPollInterval = 100;
      } else {
        this.nextPollInterval = this.pollInterval;
      }
      await this.setLastProcessedBlock(this.contract._address, toBlock);
      logger.info("last processed block set to %d", toBlock);
    } catch (err) {
      logger.error("processRange failed: %s", err);
    }
  }

  async processRange(contract, fromBlock, toBlock) {
    logger.info(
      "processRange : Reading Events %s from %d to %d",
      contract._address,
      fromBlock,
      toBlock
    );
    let events = await contract.getPastEvents("allEvents", {
      fromBlock,
      toBlock
    });

    // Events shouldnt have a name
    events = events.filter(evt => evt.event);
    // Unique hash for each event
    events = events.map(evt =>
      Object.assign(
        {
          eventHash: this.web3.utils.sha3(evt.transactionHash + evt.logIndex)
        },
        evt
      )
    );
    // Events shouldnt have duplicates
    events = lodash.uniqBy(events, "eventHash");

    // Events shouldnt be processed
    events = await asyncIters.filter(events, async evt => {
      const log = await this.getTx(evt.eventHash)
      return !log;
    });
    events = await asyncIters.map(events, evt => this.eventToTx(evt));

    for (const evt of events) {
      await this.processEvent(evt);
      await this.markTx(evt.eventHash);
    }
  }

  eventToTx(event) {
    return this.web3.eth
      .getTransaction(event.transactionHash)
      .then(tx =>
        Object.assign({}, event, {
          foreignTx: tx
        })
      )
      .catch(e => {
        debugger;
      });
  }

  getLastProcessedBlock(address) {
    const key = this.dbscope + address + "-lastblock";
    return db
      .get(key)
      .then(val => {
        return parseInt(val);
      })
      .catch(err => {
        if (err.notFound) {
          logger.info("no last block found in DB - set default %d", 0);
          return this.setLastProcessedBlock(address, 0);
        }
        throw new Error(err);
      })
      .then(lastblock => {
        return parseInt(lastblock);
      });
  }

  setLastProcessedBlock(address, number) {
    const key = this.dbscope + address + "-lastblock";
    return new Promise(resolve => {
      db.put(key, number, err => {
        if (err) {
          throw new Error(err);
        }
        return resolve(parseInt(number));
      });
    });
  }

  getTx(txHash) {
    const key = this.dbscope + txHash;
    return db
      .get(key)
      .then(val => {
        return val;
      })
      .catch(err => {
        if (err.notFound) {
          return null;
        }
        throw new Error(err);
      });
  }

  markTx(txHash, val) {
    const key = this.dbscope + txHash;
    db.put(key, val || Date.now(), err => {
      if (err) {
        throw new Error(err);
      }
      return Promise.resolve();
    });
  }

  async sendTx(call, fromKey, to) {
    // Transaction must be send with the provided validator key pair (signKey).
    // Web3 doesnt allow this so a custom transaction must be created.
    let data = call.encodeABI();
    const privateKey = Buffer.from(fromKey.private, "hex");

    let [nonce, gasPrice, balance, gasEstimate] = await Promise.all([
      this.web3.eth.getTransactionCount(fromKey.public, "pending"),
      this.web3.eth.getGasPrice(),
      this.web3.eth.getBalance(fromKey.public),
      call.estimateGas()
    ]);

    gasPrice = new this.web3.utils.BN(gasPrice);
    gasEstimate = new this.web3.utils.BN(gasEstimate).mul(
      new this.web3.utils.BN(2)
    );

    const txPriceBN = gasPrice.mul(gasEstimate);
    const balanceBN = new this.web3.utils.BN(balance);

    if (balanceBN.lt(txPriceBN)) {
      logger.error(
        "Balance of signer (%s) is too low.. (%s Wei)",
        fromKey.public,
        balanceBN.toString()
      );
      return Promise.reject(
        new Error("Balance of signer too low to execute Tx")
      );
    }

    const txParams = {
      nonce: new this.web3.utils.BN(nonce),
      gasPrice: new this.web3.utils.BN(gasPrice),
      gasLimit: new this.web3.utils.BN(gasEstimate),
      to,
      data
    };

    const tx = new EthereumTx(txParams);
    tx.sign(privateKey);
    const serializedTx = tx.serialize().toString("hex");

    logger.info("Bridge tx generated & signed");

    return await this.web3.eth.sendSignedTransaction("0x" + serializedTx);
  }
}

module.exports = BridgeUtil;
