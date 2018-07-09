const logger = require('./logs')(module);
const EthereumTx = require('ethereumjs-tx');
let db;

class BridgeUtil {
	constructor(web3, contractInstance, defaultStartBlock, pollInterval, processEvent, rescan, dbscope) {
		this.web3 = web3;
		this.contract = contractInstance;
		this.defaultStartBlock = defaultStartBlock;
		this.pollInterval = pollInterval;
		this.nextPollInterval = pollInterval;
		this.processEvent = processEvent;
		this.rescan = rescan;
		this.dbscope = dbscope;
		db = require('./db')(this.dbscope);
	}

	async startPolling() {
		if (typeof this.defaultStartBlock !== "number") {
			this.defaultStartBlock = await this.web3.eth.getBlockNumber()
		} else if (this.rescan) {
			logger.info('forcing rescan from startblock %d', this.defaultStartBlock);
			this.setLastProcessedBlock(this.contract._address, this.defaultStartBlock)
		}

		this.pollLoop();
	}

	async pollLoop() {
		const lastProccessedBlock = await	this.getLastProcessedBlock(this.contract._address)
		logger.info('start polling from last processed block %d', lastProccessedBlock)
		await this.poll()
		setTimeout(() => this.pollLoop(), this.nextPollInterval);
	}

	poll() {
		return Promise.all([
				this.getLastProcessedBlock(this.contract._address),
				this.web3.eth.getBlockNumber(),
			])
			.then(([
				lastProccessedBlock,
				currentBlock,
			]) => {

				lastProccessedBlock = lastProccessedBlock || this.defaultStartBlock

				if (currentBlock < lastProccessedBlock) {
					logger.warn('chain blocknumber too low.. current = %d < lastprocesssed = %d (node not in sync?)', currentBlock, lastProccessedBlock);
					return;
				}
				const fromBlock = lastProccessedBlock;
				let toBlock = currentBlock;

				// cap range to 10000
				if ((toBlock - fromBlock) > 10000) {
					toBlock = fromBlock + 10000;
				}

				if (fromBlock === toBlock) {
					logger.info('polling of %s idle..', this.contract._address);
					return Promise.resolve();
				}

				logger.info('scanning %s range %d->%d (%d blocks ; %d blocks away from top of chain)',
					this.contract._address, fromBlock, toBlock, toBlock - fromBlock, currentBlock - fromBlock);

				return this.processRange(this.contract, fromBlock, toBlock)
					.then((lastProcessedBlock) => {
						// unless we're at the end of the chain - continue immediately
						if (lastProcessedBlock < currentBlock) {
							this.nextPollInterval = 100;
						} else {
							this.nextPollInterval = this.pollInterval;
						}
						return this.setLastProcessedBlock(this.contract._address, lastProcessedBlock)
							.then((lastProcesseBlockFromDB) => {
								logger.info('last processed block set to %d', lastProcesseBlockFromDB);
								return Promise.resolve();
							});
					})
					.catch((e) => {
						logger.error('processRange failed: %s', e);
						return Promise.resolve();
					});
			});
	}

	async processRange(contract, startBlock, endBlock) {
		logger.info('processRange : Reading Events %s from %d to %d', contract._address, startBlock, endBlock);
		let events = await contract.getPastEvents('allEvents', {
			// Only listen on events for contract at current address
			filter: {_from: contract._address},
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
			})).catch((e) => {
				debugger;
			});
	}

	getLastProcessedBlock(address) {
		const key = this.dbscope + address + '-lastblock';
		return db.get(key).then((val) => {
			return parseInt(val);
		}).catch((err) => {
			if (err.notFound) {
				logger.info('no last block found in DB - set default %d', 0);
				return this.setLastProcessedBlock(address, 0);
			}
			throw new Error(err);
		}).then((lastblock) => {
			return parseInt(lastblock);
		});
	}

	setLastProcessedBlock(address, number) {
		const key = this.dbscope + address + '-lastblock';
		return new Promise(resolve => {
			db.put(key, number, (err) => {
				if (err) {
					throw new Error(err);
				}
				return resolve(parseInt(number));
			});
		});
	}

	getTx(txHash) {
		const key = this.dbscope + txHash;
		return db.get(key).then((val) => {
			return val;
		}).catch((err) => {
			if (err.notFound) {
				return null;
			}
			throw new Error(err);
		});
	}

	markTx(txHash, val) {
		const key = this.dbscope + txHash;
		db.put(key, val || Date.now(), (err) => {
			if (err) {
				throw new Error(err);
			}
			return Promise.resolve();
		});
	}

	async sendTx(call, fromKey, to) {
		// Transaction must be send with the provided validator key pair (signKey).
		// Web3 doesnt allow this so a custom transaction must be created.
		let data = call.encodeABI();
		const privateKey = Buffer.from(fromKey.private, 'hex');

		let [nonce, gasPrice, balance, gasEstimate] = await Promise.all([
			this.web3.eth.getTransactionCount(fromKey.public, 'pending'),
			this.web3.eth.getGasPrice(),
			this.web3.eth.getBalance(fromKey.public),
			call.estimateGas(),
		])

		// add gas because you might be the one minting tokens
		// and the gas calculation does not know that yet.
		gasEstimate = parseInt(gasEstimate) + 300000;

		const txPriceBN = (new this.web3.utils.BN(gasPrice)).mul(new this.web3.utils.BN(gasEstimate));
		const balanceBN = new this.web3.utils.BN(balance);

		if (balanceBN.lt(txPriceBN)) {
			logger.error('Balance of signer (%s) is too low.. (%s Wei)', fromKey.public, balanceBN.toString());
			return Promise.reject(new Error('Balance of signer too low to execute Tx'));
		}

		const txParams = {
			nonce: new this.web3.utils.BN(nonce),
			gasPrice: new this.web3.utils.BN(gasPrice),
			gasLimit: new this.web3.utils.BN(gasEstimate),
			to,
			data
		};

		const tx = new EthereumTx(txParams);
		tx.sign(privateKey);
		const serializedTx = tx.serialize().toString('hex');

		logger.info('Bridge tx generated & signed');

		return await this.web3.eth.sendSignedTransaction('0x' + serializedTx)
	}
}

module.exports = BridgeUtil;
