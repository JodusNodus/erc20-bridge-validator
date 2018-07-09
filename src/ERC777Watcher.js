const Web3 = require('web3');
const logger = require('./logs')(module);
const ERC777 = require('../../erc20-bridge/build/contracts/ERC777Token.json');
const bridgeLib = require('../../erc20-bridge/bridgelib')();
const BridgeUtil = require('./BridgeUtil');

/**
 * Watch for transfers from the ERC777 token to the foreign bridge contract.
 */
class ERC777Watcher {
	constructor(web3, mainTokenAdress, foreignTokenAdress, startBlock, tokenRecipient, signKey, idlePollTimeout, bridges) {
		logger.info('starting ERC777 watcher contract %s', foreignTokenAdress);

		this.web3 = web3;
		this.contract = new this.web3.eth.Contract(ERC777.abi, foreignTokenAdress);

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

	async processEvent(contract, event) {
		if (!event.event) {
			return;
		}
		logger.info('erc777 event: %s', event.event);

		const eventHandlers = {
			Sent: this.onSent,
			WithdrawRequestSigned: this.onWithdrawRequestSigned
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			// Make sure event is only handled once
			const eventHash = this.web3.utils.sha3(event.transactionHash + event.logIndex);

			const txHashLog = await this.bridgeUtil.getTx(eventHash);
			if (txHashLog) {
				logger.info('Skipping already processed event %s', event.transactionHash);
				return;
			}

			await this.bridgeUtil.markTx(eventHash);
			await eventHandler.call(this, contract, event)
		}
	}

	async onSent(contract, event) {
		const { from, to, amount } = event.returnValues

		if (amount <= 0) {
			return;
		}

		if (to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			// transfer to another address than the bridge.. Not interested in this
		} else {
			await this.foreignBridge.signWithdrawRequest(this.mainTokenAdress, event.transactionHash, event.blockNumber, from, amount)
		}
	}

	async onWithdrawRequestSigned(contract, event) {

	}
}


module.exports = ERC777Watcher;
