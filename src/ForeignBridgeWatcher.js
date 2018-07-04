const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignERC777Bridge = require('../../erc20-bridge/build/contracts/ForeignERC777Bridge.json');
const ERC20Watcher = require('./ERC20Watcher');
const BridgeUtil = require('./BridgeUtil');

const idlePollTimeout = 10000; // 10s

class ForeignBridgeWatcher {
	constructor(mainWebsocketURL, foreignWebsocketURL, homeBridgeContractAddress, foreignBridgeContractAddress, startBlockMain, startBlockForeign, keyFile, rescan) {
		logger.info('starting bridge %s - startblock %d', foreignWebsocketURL, startBlockForeign);

		this.mainWebsocketURL = mainWebsocketURL;
		this.foreignWebsocketURL = foreignWebsocketURL;
		this.web3 = new Web3(new Web3.providers.WebsocketProvider(foreignWebsocketURL));
		this.bridge = new this.web3.eth.Contract(ForeignERC777Bridge.abi, foreignBridgeContractAddress);
		this.startBlock = startBlockForeign;
		this.startBlockMain = startBlockMain;
		this.homeBridgeContractAddress = homeBridgeContractAddress;
		this.keyFile = keyFile;
		this.signKey = require(this.keyFile);
		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.bridge,
			this.processRange,
			this.startBlock,
			idlePollTimeout,
			this,
			rescan,
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
		let watcher = new ERC20Watcher(
			// Only on foreign net for testing
			this.foreignWebsocketURL,
			address,
			this.startBlockMain,
			this.homeBridgeContractAddress,
			this.keyFile,
			this.bridge);
		this.tokenwatchers.push(watcher);
	}

	processRange(contract, startBlock, endBlock) {
		logger.info('processRange : Reading Events from %d to %d', startBlock, endBlock);
		return contract
			.getPastEvents('allEvents', {
				fromBlock: startBlock,
				toBlock: endBlock
			})

			.then((events) => Promise.all(events.map(e => this.eventToTx(e))))
			.then((events) => events.map(e => this.processEvent(contract, e)))
			.then(promises => Promise.all(promises))
			.then(() => {
				return Promise.resolve(endBlock);
			});

	}

	eventToTx(event) {
		return this.web3.eth.getTransaction(event.transactionHash)
			.then(tx => Object.assign({}, event, {
				foreignTx: tx
			}));
	}

	processEvent(contract, event) {
		logger.info('bridge event : %s', event.event);
		const eventHandlers = {
			TokenAdded: this.onTokenAdded,
			MintRequestSigned: this.onMintRequestSigned,
			ValidatorAdded: this.onValidatorAdded
		}

		const eventHandler = eventHandlers[event.event]

		if(eventHandler) {
			return eventHandler.call(this, contract, event)
		} else {
			logger.info('unhandled event %s', event.event);
			return Promise.resolve();
		}
	}

	onTokenAdded(contract, event) {
		this.addERC20Watcher(event.returnValues._mainToken, event.foreignTx.blockNumber)
	}

	onMintRequestSigned(contract, event) {
		if (event.foreignTx.from.toLowerCase() == this.signKey.public.toLowerCase()) {
			logger.info('Marking MintRequestSigned with TxHash %s as processed ( txhash %s )', event.returnValues._mintRequestsHash, event.transactionHash);
			this.bridgeUtil.markTx(event.transactionHash, {
				date: Date.now(),
				event: event,
			});
		}
	}

	onValidatorAdded(contract, event) {
		// we can ignore these events
	}
}

module.exports = ForeignBridgeWatcher;
