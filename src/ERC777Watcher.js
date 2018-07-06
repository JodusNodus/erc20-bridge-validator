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

		let call = await this.foreignBridge.methods.signWithdrawRequest(
			transactionHash,
			this.mainTokenAdress,
			from,
			amount,
			blockNumber,
			validatorSignature.v,
			validatorSignature.r,
			validatorSignature.s);

		// Transaction must be send with the provided validator key pair (signKey).
		// Web3 doesnt allow this so a custom transaction must be created.
		let data = call.encodeABI();
		const privateKey = Buffer.from(this.signKey.private, 'hex');

		let [nonce, gasPrice, balance, gasEstimate] = await Promise.all([
			this.web3.eth.getTransactionCount(this.signKey.public, 'pending'),
			this.web3.eth.getGasPrice(),
			this.web3.eth.getBalance(this.signKey.public),
			call.estimateGas(),
		])

		// add gas because you might be the one minting tokens
		// and the gas calculation does not know that yet.
		gasEstimate = 500000; //parseInt(gasEstimate) + 300000;

		const txPriceBN = (new this.web3.utils.BN(gasPrice)).mul(new this.web3.utils.BN(gasEstimate));
		const balanceBN = new this.web3.utils.BN(balance);

		if (balanceBN.lt(txPriceBN)) {
			logger.error('Balance of signer (%s) is too low.. (%s Wei)', this.signKey.public, balanceBN.toString());
			return Promise.reject(new Error('Balance of signer too low to execute Tx'));
		}

		const txParams = {
			nonce: new this.web3.utils.BN(nonce),
			gasPrice: new this.web3.utils.BN(gasPrice),
			gasLimit: new this.web3.utils.BN(gasEstimate),
			to: this.foreignBridge._address,
			data: data
		};

		const tx = new EthereumTx(txParams);
		tx.sign(privateKey);
		const serializedTx = tx.serialize().toString('hex');

		logger.info('Bridge tx generated & signed');

		await this.web3.eth.sendSignedTransaction('0x' + serializedTx)
			.on('receipt', (receipt) => {
				logger.info('Bridge transaction sent. Tx %j', receipt);
				return receipt;
			});
	}

	async onWithdrawRequestSigned(contract, event) {

	}
}


module.exports = ERC777Watcher;
