const HomeBridge = require('../../erc20-bridge/build/contracts/HomeBridge.json');
const logger = require('./logs')(module);
const BridgeUtil = require('./BridgeUtil');

class HomeBridgeWatcher {

  constructor(options, connections, bridges, signKey) {

    this.web3 = connections.home;
    this.options = options;
    this.bridges = bridges;

		this.contractAddress = options.HOME_BRIDGE;
    this.contract = new this.web3.eth.Contract(HomeBridge.abi, this.contractAddress);

		this.options = options;
    this.signKey = signKey;
    

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.contract,
			options.START_BLOCK_HOME,
			options.POLL_INTERVAL,
			this.processEvent.bind(this),
      options.RESCAN,
      this.signKey.public + this.contractAddress
    );

    logger.info('starting home bridge on %s', options.HOME_URL);

    // No events are currently needed 
		this.bridgeUtil.startPolling()
      .then(() => {});
  }

  async processEvent(evt) {
		logger.info('HomeBridge event: %s', evt.event);

		const eventHandlers = {
			DepositReceived: this.onDepositReceived,
		}

		const eventHandler = eventHandlers[evt.event];

		if (eventHandler) {
			await eventHandler.call(this, evt);
		}
  }

  async onDepositReceived(evt) {
    try {
      const { _from, _amount, _mainToken, _data } = evt.returnValues;
      const { isHexStrict, isAddress } = this.web3.utils;
      console.log(evt.returnValues)

      const r = {
        txhash: evt.transactionHash,
        sender: _from.toLowerCase(),
        recipient: _data.toLowerCase(),
        token: _mainToken.toLowerCase(),
        amount: _amount
      }

      if (r.amount <= 0) {
        return;
      }

      // Data field should be a valid recipient address
      if (!isHexStrict(r.recipient) || !isAddress(r.recipient)) {
        return;
      }

      logger.info('Deposit event received %s', JSON.stringify(r, null, 4));

			await this.bridges.foreign.signMintRequest(r.token, r.txhash, r.recipient, r.amount)
		} catch (err) {
			logger.info('Bridge deposit request failed %s', err);
			await Promise.reject(err);
		}
  }
}

module.exports = HomeBridgeWatcher;