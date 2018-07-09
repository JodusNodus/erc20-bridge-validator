const Web3 = require('web3');
const logger = require('./logs')(module);
const ForeignERC777Bridge = require('../../erc20-bridge/build/contracts/ForeignERC777Bridge.json');
const HomeERC20Bridge = require('../../erc20-bridge/build/contracts/HomeERC20Bridge.json');
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
		this.homeBridge = new this.web3.eth.Contract(HomeERC20Bridge.abi, options.mainContractAddress);

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

		this.withdrawRequestSignatures = new Map();

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
		if (!event.event) {
			return;
		}
		logger.info('bridge event : %s %s', event.event, event.transactionHash);

		const eventHandlers = {
			TokenAdded: this.onTokenAdded,
			MintRequestSigned: this.onMintRequestSigned,
			MintRequestExecuted: this.onMintRequestExecuted,
			ValidatorAdded: this.onValidatorAdded,
			WithdrawRequestSigned: this.onWithdrawRequestSigned,
			WithdrawRequestGranted: this.onWithdrawRequestGranted
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

	// Collect all request signatures
	async onWithdrawRequestSigned(contract, event) {
		const {_withdrawRequestsHash, _signer, _v, _r, _s} = event.returnValues;
		let signatures = this.withdrawRequestSignatures.get(_withdrawRequestsHash);
		if (!signatures) {
			signatures = [];
			this.withdrawRequestSignatures.set(_withdrawRequestsHash, signatures);
		}

		// Check if signature hasnt been added already
		if(signatures.find(s => s._signer === _signer)) {
			return;
		}

		signatures.push({ _v, _r, _s, _signer });
	}

	async onWithdrawRequestGranted(contract, event) {
		const {_withdrawRequestsHash, _transactionHash, _mainToken, _recipient, _amount, _withdrawBlock } = event.returnValues;

		const reward = 0;

		const _v = [];
		const _r = [];
		const _s = [];

		const signatures = this.withdrawRequestSignatures.get(_withdrawRequestsHash);

		// This validator node hasnt catched the signatures.
		if (signatures.length <= 0) {
			return;
		}

		for (const s of signatures) {
			_v.push(s._v);
			_r.push(s._r);
			_s.push(s._s);
		}

		const call = this.homeBridge.methods.withdraw(_mainToken, _recipient, _amount, _withdrawBlock, reward, _v, _r, _s);
		const res = await this.bridgeUtil.sendTx(call, this.signKey, this.homeBridge._address);
	}

}

module.exports = ForeignBridgeWatcher;
