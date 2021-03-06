const logger = require('./logs')(module);
const ERC20 = require('../../erc20-bridge/build/contracts/ERC20.json');
const bridgeLib = require('../../erc20-bridge/bridgelib')();
const BridgeUtil = require('./BridgeUtil');

/**
 * Watch for transfers from a registered ERC20 token to the bridge contract.
 */
class HomeTokenWatcher {
	constructor(web3, mainTokenAdress, foreignTokenAdress, startBlock, tokenRecipient, signKey, idlePollTimeout, bridges) {
		logger.info('starting home token watcher %s', mainTokenAdress);

		this.web3 = web3;
		this.contractAddress = mainTokenAdress;
		this.contract = new this.web3.eth.Contract(ERC20.abi, this.contractAddress);

		this.startBlock = startBlock;
		this.tokenRecipient = tokenRecipient;
		this.mainTokenAdress = mainTokenAdress;
		this.foreignTokenAdress = foreignTokenAdress;

		this.homeBridge = bridges.home;
		this.foreignBridge = bridges.foreign;

		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.contract,
			this.startBlock,
			idlePollTimeout,
			this.processEvent.bind(this),
			false,
			this.signKey.public + this.contractAddress,
		);

		this.bridgeUtil.startPolling()
			.then(() => {})
	}

	async processEvent(event) {
		logger.info('erc20 event: %s', event.event);

		const eventHandlers = {
			Transfer: this.onTransfer
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			await eventHandler.call(this, event)
		}
	}

	async onTransfer(event) {
		if (event.returnValues.to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			// transfer to another address than the bridge.. Not interested in this
			return;
		} 
		const t = {
			token: event.foreignTx.to.toLowerCase(),
			txhash: event.transactionHash,
			from: event.returnValues.from.toLowerCase(),
			value: event.returnValues.value,
		};

		if (t.value <= 0) {
			return;
		}

		logger.info('Transfer event received %s', JSON.stringify(t, null, 4));

		try {
			await this.foreignBridge.signMintRequest(t.token, t.txhash, t.from, t.value)
		} catch (err) {
			logger.info('Bridge signing failed %s', err);
			await Promise.reject(err);
		}
	}
}


module.exports = HomeTokenWatcher;
