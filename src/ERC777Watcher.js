const Web3 = require('web3');
const logger = require('./logs')(module);
const ERC777 = require('../../erc20-bridge/build/contracts/ERC777Token.json');
const bridgeLib = require('../../erc20-bridge/bridgelib')();
const BridgeUtil = require('./BridgeUtil');
const EthereumTx = require('ethereumjs-tx');

const idlePollTimeout = 10000; // 10s

/**
 * Watch for transfers from the ERC777 token to the foreign bridge contract.
 */
class ERC777Watcher {
	constructor(web3, contractAddress, startBlock, tokenRecipient, signKey, foreignBridge, dbscope) {
		logger.info('starting ERC777 watcher contract %s', contractAddress);

		this.web3 = web3;
		this.contract = new this.web3.eth.Contract(ERC777.abi, contractAddress);

		this.startBlock = startBlock;
		this.tokenRecipient = tokenRecipient;
		this.contractAddress = contractAddress;
		this.foreignBridge = foreignBridge;

		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.contract,
			this.startBlock,
			idlePollTimeout,
			this.processEvent.bind(this),
			false,
			dbscope,
		);

		this.bridgeUtil.startPolling()
			.then(() => {})
	}

	async processEvent(contract, event) {
		logger.info('erc777 event: %s', event.event);

		const txHashLog = await this.bridgeUtil.getTx(event.transactionHash)
		if (txHashLog) {
			logger.info('Skipping already processed Tx %s', event.transactionHash);
			return;
		}

		const eventHandlers = {
			Sent: this.onSent
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			await eventHandler.call(this, contract, event)
		} else {
			logger.info('unhandled event %s', event.event);
		}
	}

	async onSent(contract, event) {
		await this.bridgeUtil.markTx(event.transactionHash)

		console.log(event)

		if (event.returnValues.to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			// transfer to another address than the bridge.. Not interested in this
		} else {
		}
	}
}


module.exports = ERC777Watcher;
