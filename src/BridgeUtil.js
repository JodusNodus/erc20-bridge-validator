const logger = require('./logs')(module);
let db;

class BridgeUtil {
	constructor(web3, contractInstance, processRange, defaultStartBlock, pollInterval, parentScope, rescan, signerPubKey) {
		this.web3 = web3;
		this.contract = contractInstance;
		this.processRange = processRange;
		this.defaultStartBlock = defaultStartBlock;
		this.pollInterval = pollInterval;
		this.nextPollInterval = pollInterval;
		this.parentScope = parentScope;
		this.rescan = rescan;
		this.dbscope = signerPubKey;
		db = require('./db')(this.dbscope);
	}

	async startPolling() {
		if (typeof this.defaultStartBlock !== "number") {
			this.defaultStartBlock = await this.web3.eth.getBlockNumber()
		}

		if (this.rescan) {
			logger.info('forcing rescan from startblock %d', this.defaultStartBlock);
			return this.setLastProcessedBlock(this.contract._address, this.defaultStartBlock)
		}

		this.pollLoop();
	}

	pollLoop() {
		this.getLastProcessedBlock(this.contract._address).then((lastProccessedBlock) => {
			logger.info('start polling from last processed block %d', lastProccessedBlock);
			this.poll().then(() => {
				setTimeout(() => this.pollLoop(), this.nextPollInterval);;
			});
		});
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

				return this.processRange.bind(this.parentScope)(this.contract, fromBlock, toBlock, this.parentScope)
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
}

module.exports = BridgeUtil;
