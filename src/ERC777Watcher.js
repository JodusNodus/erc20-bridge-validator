const Web3 = require('web3');
const logger = require('./logs')(module);
const ERC777 = require('../../erc20-bridge/build/contracts/ERC777Token.json');
const bridgeLib = require('../../erc20-bridge/bridgelib')();
const BridgeUtil = require('./BridgeUtil');

const idlePollTimeout = 10000; // 10s

/**
 * Watch for transfers from the ERC777 token to the foreign bridge contract.
 */
class ERC777Watcher {
	constructor(web3, mainTokenAdress, foreignTokenAdress, startBlock, tokenRecipient, signKey, foreignBridge, dbscope) {
		logger.info('starting ERC777 watcher contract %s', foreignTokenAdress);

		this.web3 = web3;
		this.contract = new this.web3.eth.Contract(ERC777.abi, foreignTokenAdress);

		this.startBlock = startBlock;
		this.tokenRecipient = tokenRecipient;
		this.mainTokenAdress = mainTokenAdress;
		this.foreignTokenAdress = foreignTokenAdress;
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
			Sent: this.onSent,
			WithdrawRequestSigned: this.onWithdrawRequestSigned
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

		const { from, to, amount } = event.returnValues
		console.log(event.returnValues)

		if (to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			// transfer to another address than the bridge.. Not interested in this
		} else {
			await this.signWithdraw(event.transactionHash, event.blockNumber, from, amount)
		}
	}

	/**
	 * Sign request to withdraw tokens on main net
	 */
	async signWithdraw(transactionHash, blockNumber, from, amount) {
		const validatorSignature = bridgeLib.signWithdrawRequest(this.mainTokenAdress, from, amount, blockNumber, this.signKey.private);

		const call = this.foreignBridge.methods.signWithdrawRequest(
			transactionHash,
			this.mainTokenAdress,
			from,
			amount,
			blockNumber,
			validatorSignature.v,
			validatorSignature.r,
			validatorSignature.s);

		await this.bridgeUtil.sendTx(call, this.signKey, this.foreignBridge._address);
	}

	async onWithdrawRequestSigned(contract, event) {

	}
}


module.exports = ERC777Watcher;
