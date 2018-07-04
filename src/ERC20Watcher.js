const Web3 = require('web3');
const logger = require('./logs')(module);
const ERC20 = require('../../erc20-bridge/build/contracts/ERC20.json');
const bridgeLib = require('../../erc20-bridge/bridgelib')();
const BridgeUtil = require('./BridgeUtil');
const EthereumTx = require('ethereumjs-tx');

const idlePollTimeout = 10000; // 10s

class ERC20Watcher {
	constructor(web3WebsocketUrl, contractAddress, startBlock, tokenRecipient, signKey, foreignBridge) {
		logger.info('starting ERC20 watcher %s - contract %s', web3WebsocketUrl, contractAddress);

		this.web3 = new Web3(new Web3.providers.WebsocketProvider(web3WebsocketUrl));
		this.bridge = new this.web3.eth.Contract(ERC20.abi, contractAddress);

		this.startBlock = startBlock;
		this.tokenRecipient = tokenRecipient;
		this.contractAddress = contractAddress;
		this.foreignBridge = foreignBridge;

		this.signKey = signKey;

		this.bridgeUtil = new BridgeUtil(
			this.web3,
			this.bridge,
			this.processRange,
			this.startBlock,
			idlePollTimeout,
			this,
			true,
			this.signKey.public + '-' + contractAddress, // scope of the DB keys
		);

		this.bridgeUtil.startPolling()
			.then(() => {})
	}

	processRange(contract, startBlock, endBlock) {
		logger.info('processRange : Reading Events %s from %d to %d', this.contractAddress, startBlock, endBlock);
		return contract
			.getPastEvents('allEvents', {
				fromBlock: startBlock,
				toBlock: endBlock
			})

			.then((events) => Promise.all(events.map(e => this.eventToTx(e))))
			.then((events) => Promise.all(events.map(e => this.processEvent(contract, e))))
			.then(promises => Promise.all(promises))
			.then(() => {
				return Promise.resolve(endBlock);
			})
			.catch((e) => {
				return Promise.reject(e);
			})

	}

	eventToTx(event) {
		return this.web3.eth.getTransaction(event.transactionHash)
			.then(tx => Object.assign({}, event, {
				foreignTx: tx
			})).catch((e) => {
				debugger;
			});
	}

	processEvent(contract, event) {
		//logger.info('%j', event);
		return this.bridgeUtil.getTx(event.transactionHash)
			.then((txHashLog) => {
				if (txHashLog) {
					logger.info('Skipping already processed Tx %s', event.transactionHash);
					return Promise.resolve();
				}
				switch (event.event) {
					case 'Transfer':
						if (event.returnValues.to.toLowerCase() != this.tokenRecipient.toLowerCase()) {
							// transfer to another address than the bridge.. Not interested in this
						} else {
							var t = {
								token: event.foreignTx.to.toLowerCase(),
								txhash: event.transactionHash,
								from: event.returnValues.from.toLowerCase(),
								value: 1,
							};
							logger.info('Transfer event received %s', JSON.stringify(t, null, 4));
							return this.bridgeToken(t.token, t.txhash, t.from, t.value)
								.then((myBridgeTxHash) => {
									return this.bridgeUtil.markTx(event.transactionHash, {
										date: Date.now(),
										myBridgeTxHash: myBridgeTxHash,
									});
								})
								.catch((e) => {
									logger.info('Bridge signing failed %s', e);
									return Promise.reject(e);
								});
						}
						break;
					default:
						return Promise.resolve();
						break;
				}
			});

	}

	bridgeToken(token, txhash, from, value) {

		// get a unique hash for this bridge request + this signer
		const mintRequestHash = bridgeLib.createMintRequest(txhash, token, from, value);
		const signRequestHash = bridgeLib.createSignRequestHash(mintRequestHash, this.signKey.public);

		// check if this hash is already in the bridge.
		return this.foreignBridge.methods.signRequestsDone(signRequestHash).call().then((signRequestExists) => {

			if (signRequestExists) {
				logger.info('Validator %s already validated this with signRequestHash=%s', this.signKey.public, signRequestHash);
				return Promise.resolve(signRequestHash);
			}

			logger.info('Validator %s bridge token will now sign Tx %s', this.signKey.public, txhash);

			let validatorSignature = bridgeLib.signMintRequest(txhash, token, from, value, this.signKey.private);


			let call = this.foreignBridge.methods.signMintRequest(txhash, token, from, value, validatorSignature.v, validatorSignature.r, validatorSignature.s);

			let data = call.encodeABI();

			const privateKey = Buffer.from(this.signKey.private, 'hex');

			return Promise.all([
				this.web3.eth.getTransactionCount(this.signKey.public, 'pending'),
				this.web3.eth.getGasPrice(),
				this.web3.eth.getBalance(this.signKey.public),
				//call.estimateGas(),
			]).then(([nonce, gasPrice, balance]) => {

				// add gas because you might be the one minting tokens
				// and the gas calculation does not know that yet.
				let gasEstimate = 500000; //parseInt(gasEstimate) + 300000;

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

				return this.web3.eth.sendSignedTransaction('0x' + serializedTx).on('receipt', (receipt) => {
					logger.info('Bridge transaction sent. Tx %j', receipt);
					return receipt;
				});
			});
		});
	}
}


module.exports = ERC20Watcher;
