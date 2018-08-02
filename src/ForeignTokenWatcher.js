const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignDTXToken = require('@settlemint/databrokerdao-dapi/build/contracts/DtxToken.json');
const BridgeUtil = require('./BridgeUtil');

/**
 * Watch for transfers from the DTX token to the foreign bridge contract.
 */
class ForeignTokenWatcher {
	constructor(web3, mainTokenAdress, foreignTokenAdress, startBlock, tokenRecipient, signKey, idlePollTimeout, bridges) {
		logger.info('starting foreign token watcher %s', foreignTokenAdress);

		this.web3 = web3;
		this.contract = new this.web3.eth.Contract(ForeignDTXToken.abi, foreignTokenAdress);

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

		this.pendingTransfers = new Map();
	}

	/**
	 * The client makes a `transferWithData` call on the Foreign DTX contract.
	 * This emits 2 events: Transfer and TransferData.
	 * Transfer contains: from, to and the value but not the data.
	 * TransferData contains: from, to and the data (the data is the recipient address).
	 * So we need to collect both events to gather the value and data. 
	 */
	async processEvent(event) {
		logger.info('erc20 event: %s', event.event);

		const eventHandlers = {
			Transfer: this.onTransfer,
			TransferData: this.onTransferData,
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			await eventHandler.call(this, event)
		}
	}

	async transferHash(evt) {
		return this.web3.utils.sha3(evt.transactionHash + evt.returnValues.from + evt.returnValues.to);
	}

	async onTransfer(event) {
		if (event.returnValues.to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			return;
		} 
		const dataEvent = this.pendingTransfers.get(this.transferHash(event));
		if (dataEvent) {
			await this.completeTransfer(event, dataEvent);
		} else {
			this.pendingTransfers.set(this.transferHash(event), event);
		}
	}

	async onTransferData(event) {
		if (event.returnValues.to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
			return;
		} 
		const transferEvent = this.pendingTransfers.get(this.transferHash(event));
		if (transferEvent) {
			await this.completeTransfer(transferEvent, event);
		} else {
			this.pendingTransfers.set(this.transferHash(event), event);
		}
	}

	async completeTransfer(transferEvent, dataEvent) {
		this.pendingTransfers.delete(transferEvent.transactionHash);

		const r = {
			txhash: transferEvent.transactionHash,
			sender: transferEvent.returnValues.from.toLowerCase(),
			recipient: dataEvent.returnValues.data.toLowerCase(),
			token: this.mainTokenAdress,
			amount: transferEvent.returnValues.value
		}

		if (r.amount <= 0) {
			return;
		}

		// Data field should be a valid recipient address
		if (!isHexStrict(r.recipient) || !isAddress(r.recipient)) {
			return;
		}

		logger.info('Transfer event received %s', JSON.stringify(r, null, 4));
		await this.foreignBridge.signWithdrawRequest(r.token, r.txhash, transferEvent.blockNumber, r.recipient, r.amount);
	}
}


module.exports = ForeignTokenWatcher;
