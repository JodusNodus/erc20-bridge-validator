const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignERC777Bridge = require('erc20-bridge/build/contracts/ForeignERC777Bridge.json');
const ERC20Watcher = require('./ERC20Watcher');
const BridgeUtil = require('./BridgeUtil');

const idlePollTimeout = 10000; // 10s

class ForeignBridgeWatcher {
	constructor(mainWebsocketURL, foreignWebsocketURL, homeBridgeContractAddress, foreignBridgeContractAddress, startBlock, keyFile, rescan) {
		logger.info('starting bridge %s - startblock %d', foreignWebsocketURL, startBlock);

		this.mainWebsocketURL = mainWebsocketURL;
		this.foreignWebsocketURL = foreignWebsocketURL;
		this.web3 = new Web3(new Web3.providers.WebsocketProvider(foreignWebsocketURL));
		this.bridge = new this.web3.eth.Contract(ForeignERC777Bridge.abi, foreignBridgeContractAddress);
		this.startBlock = startBlock;
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

		this.bridgeUtil.startPolling();
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
		switch (event.event) {
			case 'TokenAdded':
				let watcher = new ERC20Watcher(
					this.mainWebsocketURL,
					event.returnValues._mainToken,
					event.foreignTx.blockNumber,
					this.homeBridgeContractAddress,
					this.keyFile,
					this.bridge);
				this.tokenwatchers.push(watcher);
				return Promise.resolve();
			case 'MintRequestSigned':
				if (event.foreignTx.from.toLowerCase() == this.signKey.public.toLowerCase()) {
					logger.info('Marking MintRequestSigned with TxHash %s as processed ( txhash %s )', event.returnValues._mintRequestsHash, event.transactionHash);
					this.bridgeUtil.markTx(event.transactionHash, {
						date: Date.now(),
						event: event,
					});
				}
				break;
			case 'ValidatorAdded':
				// we can ignore these events
				break;
			default:
				logger.info('unhandled event %s', event.event);
				return Promise.resolve();
		}
	}
}

module.exports = ForeignBridgeWatcher;
