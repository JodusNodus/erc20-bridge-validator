const logger = require('./logs')(module);
const ForeignBridge = require('../../erc20-bridge/build/contracts/ForeignBridge.json');
const HomeTokenWatcher = require('./HomeTokenWatcher');
const ForeignTokenWatcher = require('./ForeignTokenWatcher');
const BridgeUtil = require('./BridgeUtil');
const bridgeLib = require('../../erc20-bridge/bridgelib')();

/**
 * Watch events on the Foreign bridge contract.
 */
class ForeignBridgeWatcher {
	constructor(options, connections, bridges, signKey) {

		this.web3 = connections.foreign;

		this.bridges = bridges;
		this.homeBridge = bridges.home;
		this.connections = connections;

		this.contractAddress = options.FOREIGN_BRIDGE;
		this.contract = new this.web3.eth.Contract(ForeignBridge.abi, this.contractAddress);

		this.options = options;
		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.contract,
			options.START_BLOCK_FOREIGN,
			options.POLL_INTERVAL,
			this.processEvent.bind(this),
			options.RESCAN,
			this.signKey.public + this.contractAddress
		);
		this.tokenwatchers = [];

		this.withdrawRequestSignatures = new Map();

    logger.info('starting home bridge on %s', options.FOREIGN_URL);

		this.bridgeUtil.startPolling()
			.then(() => this.startERC20Listeners())
			.then(() => {})
	}

	/**
	 * 
	 */
	async startERC20Listeners() {
		// Get tokens on home net that are registered
		const tokens = await this.contract.methods.tokens().call({ from: this.signKey.public });

		for (const mainAddress of tokens) {
			// Retrieve the corresponding token address (foreign net)
			const foreignAddress = await this.contract.methods.tokenMap(mainAddress).call({ from: this.signKey.public });
			if (foreignAddress) {
				this.addTokenWatcher(mainAddress, foreignAddress);
			}
		}
	}

	/**
	 * Create event watchers for token registered on bridge contract
	 */
	addTokenWatcher(mainAddress, foreignAddress) {
		const addressWatcher = this.tokenwatchers.find(watcher => watcher.contractAddress === mainAddress)
		if (addressWatcher) {
			return
		}
		const homeTokenWatcher = new HomeTokenWatcher(
			this.connections.home,
			mainAddress,
			foreignAddress,
			this.options.START_BLOCK_HOME,
			this.options.HOME_BRIDGE,
			this.signKey,
			this.options.POLL_INTERVAL,
			this.bridges);

		this.tokenwatchers.push(homeTokenWatcher);

		const foreignTokenWatcher = new ForeignTokenWatcher(
			this.connections.foreign,
			mainAddress,
			foreignAddress,
			this.options.START_BLOCK_FOREIGN,
			this.options.FOREIGN_BRIDGE,
			this.signKey,
			this.options.POLL_INTERVAL,
			this.bridges);
	}

	/**
	 * Validate and sign the request for minting tokens.
	 */
	async signMintRequest(token, txhash, from, value) {

		// get a unique hash for this bridge request + this signer
		const mintRequestHash = bridgeLib.createMintRequest(txhash, token, from, value);
		const signRequestHash = bridgeLib.createSignRequestHash(mintRequestHash, this.signKey.public);

		// check if this hash is already in the bridge.
		const signRequestExists = await this.contract.methods.signedRequests(signRequestHash).call();

		if (signRequestExists) {
			logger.info('Validator %s already validated this with signRequestHash=%s', this.signKey.public, signRequestHash);
			return Promise.resolve(signRequestHash);
		}

		logger.info('Validator %s bridge token will now sign Tx %s', this.signKey.public, txhash);

		let validatorSignature = bridgeLib.signMintRequest(txhash, token, from, value, this.signKey.private);

		let call = this.contract.methods.signMintRequest(txhash, token, from, value, validatorSignature.v, validatorSignature.r, validatorSignature.s);
		await this.bridgeUtil.sendTx(call, this.signKey, this.contractAddress);
	}

	/**
	 * Validate and sign the request for withdrawing tokens.
	 */
	async signWithdrawRequest(mainTokenAdress, transactionHash, blockNumber, from, amount) {
		const validatorSignature = bridgeLib.signWithdrawRequest(mainTokenAdress, from, amount, blockNumber, this.signKey.private);

		const call = this.contract.methods.signWithdrawRequest(
			transactionHash,
			mainTokenAdress,
			from,
			amount,
			blockNumber,
			validatorSignature.v,
			validatorSignature.r,
			validatorSignature.s);

		await this.bridgeUtil.sendTx(call, this.signKey, this.contractAddress);
	}

	async processEvent(event) {
		logger.info('bridge event: %s', event.event);

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
			await eventHandler.call(this, event)
		}
	}

	// New token to share between networks has been registered.
	async onTokenAdded(event) {
		this.addTokenWatcher(event.returnValues._mainToken, event.foreignTx.blockNumber)
	}

	// Request to mint token on foreign network has been validated by a validator node.
	async onMintRequestSigned(event) {
	}

	// Request was validated by enough nodes and the tokens have been minted to the owner
	// on the foreign net.
	async onMintRequestExecuted() {

	}

	async onValidatorAdded(event) {
		// we can ignore these events
	}

	// Collect all request signatures
	async onWithdrawRequestSigned(event) {
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

	async onWithdrawRequestGranted(event) {
		const {_withdrawRequestsHash, _transactionHash, _mainToken, _recipient, _amount, _withdrawBlock } = event.returnValues;
		const signatures = this.withdrawRequestSignatures.get(_withdrawRequestsHash);

		// This validator node hasnt catched the signatures.
		if (!signatures || signatures.length <= 0) {
			return;
		}

		await this.homeBridge.withdraw(
			_transactionHash,
			_mainToken,
			_recipient,
			_amount,
			_withdrawBlock,
			signatures
		);
	}

}

module.exports = ForeignBridgeWatcher;
