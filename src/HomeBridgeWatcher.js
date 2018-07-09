const HomeERC20Bridge = require('../../erc20-bridge/build/contracts/HomeERC20Bridge.json');
const logger = require('./logs')(module);
const BridgeUtil = require('./BridgeUtil');
const bridgeLib = require('../../erc20-bridge/bridgelib')();

class HomeBridgeWatcher {

  constructor(options, connections, bridges, signKey) {
    logger.info('starting home bridge on %s', options.mainWebsocketURL);

    this.web3 = connections.home;
    this.options = options;

		this.contractAddress = options.mainContractAddress;
    this.contract = new this.web3.eth.Contract(HomeERC20Bridge.abi, this.contractAddress);

		this.options = options;
		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.contract,
			options.startBlockForeign,
			options.pollInterval,
			this.processEvent.bind(this),
      options.rescan,
      this.signKey.public + this.contractAddress
    );

    // No events are currently needed 
		// this.bridgeUtil.startPolling();
  }

  async processEvent() {
  }

  /**
   * Withdraw tokens from home bridge to recipient
   */
	async withdraw(
    _transactionHash,
    _mainToken,
    _recipient,
    _amount,
    _withdrawBlock,
    signatures) {
		const _v = [];
		const _r = [];
		const _s = [];

		for (const s of signatures) {
			_v.push(s._v);
			_r.push(s._r);
			_s.push(s._s);
		}

		const call = this.contract.methods.withdraw(_mainToken, _recipient, _amount, _withdrawBlock, _v, _r, _s);
		await this.bridgeUtil.sendTx(call, this.signKey, this.contractAddress);
	}
}

module.exports = HomeBridgeWatcher;