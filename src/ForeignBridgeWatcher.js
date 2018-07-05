const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignERC777Bridge = require('../../erc20-bridge/build/contracts/ForeignERC777Bridge.json');
const ERC20Watcher = require('./ERC20Watcher');
const BridgeUtil = require('./BridgeUtil');

const idlePollTimeout = 10000; // 10s

class ForeignBridgeWatcher {
	constructor(options, signKey) {
		logger.info('starting bridge %s', options.foreignWebsocketURL);

		this.web3 = new Web3(new Web3.providers.WebsocketProvider(options.foreignWebsocketURL));
		this.bridge = new this.web3.eth.Contract(ForeignERC777Bridge.abi, options.foreignContractAddress);

		this.contractAddress = options.foreignContractAddress
		this.options = options
		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.bridge,
			this.processRange,
			options.startBlockForeign,
			options.pollInterval,
			this,
			options.rescan,
			this.signKey.public
		);
		this.tokenwatchers = [];

		this.bridgeUtil.startPolling()
			.then(() => this.startERC20Listeners())
			.then(() => {})
	}

	async startERC20Listeners() {
		const tokens = await this.bridge.methods.tokens().call({ from: this.signKey.public })
		tokens.forEach(addr => this.addERC20Watcher(addr))
	}

	addERC20Watcher(address) {
		const addressWatcher = this.tokenwatchers.find(watcher => watcher.contractAddress === address)
		if (addressWatcher) {
			return
		}
		const watcher = new ERC20Watcher(
			// Only on foreign net for testing
			this.options.foreignWebsocketURL,
			address,
			this.options.startBlockMain,
			this.options.mainContractAddress,
			this.signKey,
			this.bridge);
		this.tokenwatchers.push(watcher);
	}

	async processRange(contract, startBlock, endBlock) {
		logger.info('processRange : Reading Events %s from %d to %d', this.contractAddress, startBlock, endBlock);
		let events = await contract.getPastEvents('allEvents', {
			fromBlock: startBlock,
			toBlock: endBlock
		})
		events = await Promise.all(events.map(e => this.eventToTx(e)))

		for (const evt of events) {
			await this.processEvent(contract, evt)
		}
		
		return endBlock
	}

	eventToTx(event) {
		return this.web3.eth.getTransaction(event.transactionHash)
			.then(tx => Object.assign({}, event, {
				foreignTx: tx
			}));
	}

	async processEvent(contract, event) {
		logger.info('bridge event : %s', event.event);

		const txHashLog = await this.bridgeUtil.getTx(event.transactionHash)
		if (txHashLog) {
			logger.info('Skipping already processed Tx %s', event.transactionHash);
			return;
		}

		const eventHandlers = {
			TokenAdded: this.onTokenAdded,
			MintRequestSigned: this.onMintRequestSigned,
			ValidatorAdded: this.onValidatorAdded
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			await eventHandler.call(this, contract, event)
		} else {
			logger.info('unhandled event %s', event.event);
		}
	}

	async onTokenAdded(contract, event) {
		this.addERC20Watcher(event.returnValues._mainToken, event.foreignTx.blockNumber)
	}

	async onMintRequestSigned(contract, event) {
		// if (event.foreignTx.from.toLowerCase() == this.signKey.public.toLowerCase()) {
		// 	logger.info('Marking MintRequestSigned with TxHash %s as processed ( txhash %s )', event.returnValues._mintRequestsHash, event.transactionHash);
		// 	this.bridgeUtil.markTx(event.transactionHash, {
		// 		date: Date.now(),
		// 		event: event,
		// 	});
		// }
	}

	async onValidatorAdded(contract, event) {
		// we can ignore these events
	}
}

module.exports = ForeignBridgeWatcher;
