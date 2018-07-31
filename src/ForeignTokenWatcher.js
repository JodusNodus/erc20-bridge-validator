const Web3 = require('web3');
const logger = require('./logs')(module);
const ERC20 = require('../../erc20-bridge/build/contracts/ERC20.json');
const BridgeUtil = require('./BridgeUtil');

/**
 * Watch for transfers from the ERC20 token to the foreign bridge contract.
 */
class ForeignTokenWatcher {
	constructor(web3, mainTokenAdress, foreignTokenAdress, startBlock, tokenRecipient, signKey, idlePollTimeout, bridges) {
		logger.info('starting foreign token watcher %s', foreignTokenAdress);

		this.web3 = web3;
		this.contract = new this.web3.eth.Contract(ERC20.abi, foreignTokenAdress);

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
			this.signKey.public + '-' + foreignTokenAdress, // scope of the DB keys
		);

		this.bridgeUtil.startPolling()
			.then(() => {})
	}

	async processEvent(event) {
		logger.info('erc20 event: %s', event.event);

		const eventHandlers = {
			Transfer: this.onTransfer,
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

		await this.foreignBridge.signWithdrawRequest(this.mainTokenAdress, t.txhash, event.blockNumber, t.from, t.value);
	}
}


module.exports = ForeignTokenWatcher;
