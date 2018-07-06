const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignERC777Bridge = require('../../erc20-bridge/build/contracts/ForeignERC777Bridge.json');
const ERC20Watcher = require('./ERC20Watcher');
const ERC777Watcher = require('./ERC777Watcher');
const BridgeUtil = require('./BridgeUtil');

const idlePollTimeout = 10000; // 10s

/**
 * Watch events on the Foreign bridge contract.
 */
class ForeignBridgeWatcher {
	constructor(options, signKey) {
		logger.info('starting bridge %s', options.foreignWebsocketURL);

		this.web3 = new Web3(new Web3.providers.WebsocketProvider(options.foreignWebsocketURL));
		this.bridge = new this.web3.eth.Contract(ForeignERC777Bridge.abi, options.foreignContractAddress);

		this.contractAddress = options.foreignContractAddress
		this.options = options
		this.signKey = signKey;
		this.dbscope = this.signKey.public

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.bridge,
			options.startBlockForeign,
			options.pollInterval,
			this.processEvent.bind(this),
			options.rescan,
			this.dbscope
		);
		this.tokenwatchers = [];

		this.bridgeUtil.startPolling()
			.then(() => this.startERC20Listeners())
			.then(() => {})
	}

	/**
	 * 
	 */
	async startERC20Listeners() {
		// Get tokens on home net that are registered
		const tokens = await this.bridge.methods.tokens().call({ from: this.signKey.public });

		for (const mainAddress of tokens) {
			// Retrieve the corresponding ERC777 token address (foreign net)
			const foreignAddress = await this.bridge.methods.tokenMap(mainAddress).call({ from: this.signKey.public });
			if (foreignAddress) {
				this.addTokenWatcher(mainAddress, foreignAddress);
			}
		}
	}

	addTokenWatcher(mainAddress, foreignAddress) {
		const addressWatcher = this.tokenwatchers.find(watcher => watcher.contractAddress === mainAddress)
		if (addressWatcher) {
			return
		}
		const erc20Watcher = new ERC20Watcher(
			this.options.mainWebsocketURL,
			mainAddress,
			this.options.startBlockMain,
			this.options.mainContractAddress,
			this.signKey,
			this.bridge);

		this.tokenwatchers.push(erc20Watcher);

		// Same network -> Pass web3 instance and DB scope
		const erc777Watcher = new ERC777Watcher(
			this.web3,
			mainAddress,
			foreignAddress,
			this.options.startBlockForeign,
			this.options.foreignContractAddress,
			this.signKey,
			this.bridge,
			this.dbscope);
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
			MintRequestExecuted: this.onMintRequestExecuted,
			ValidatorAdded: this.onValidatorAdded
		}

		const eventHandler = eventHandlers[event.event]

		if (eventHandler) {
			await eventHandler.call(this, contract, event)
		} else {
			logger.info('unhandled event %s', event.event);
		}
	}

	// New token to share between networks has been registered.
	async onTokenAdded(contract, event) {
		this.addTokenWatcher(event.returnValues._mainToken, event.foreignTx.blockNumber)
	}

	// Request to mint token on foreign network has been validated by a validator node.
	async onMintRequestSigned(contract, event) {
		// if (event.foreignTx.from.toLowerCase() == this.signKey.public.toLowerCase()) {
		// 	logger.info('Marking MintRequestSigned with TxHash %s as processed ( txhash %s )', event.returnValues._mintRequestsHash, event.transactionHash);
		// 	this.bridgeUtil.markTx(event.transactionHash, {
		// 		date: Date.now(),
		// 		event: event,
		// 	});
		// }
	}

	// Request was validated by enough nodes and the ERC777 tokens have been minted to the address of the owner
	// on the foreign net.
	async onMintRequestExecuted() {

	}

	async onValidatorAdded(contract, event) {
		// we can ignore these events
	}
}

module.exports = ForeignBridgeWatcher;
