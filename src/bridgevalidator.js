const Web3 = require("web3");
const bip39 = require('bip39');
const Wallet = require('ethereumjs-wallet');
const hdkey = require('ethereumjs-wallet/hdkey');
const HDWalletProvider = require('truffle-hdwallet-provider')
const HomeBridgeWatcher = require('./HomeBridgeWatcher');
const ForeignBridgeWatcher = require('./ForeignBridgeWatcher');
const logger = require('./logs')(module);

function seedToSignKey(seed) {
	const provider = new HDWalletProvider(seed)
	const public = provider.addresses[0];
	const private = provider.wallets[public].getPrivateKeyString().slice(2);
	return {
		private,
		public
	}
}

/**
 * Bootstrap the validator node
 *
 */

class BridgeValidator {
	/**
	 * constructor
	 *
	 * @param      {object}  options  The options
	 */
	constructor(options) {
		this.options = options
	}

	/**
	 * Bootstrap the validator code
	 *
	 */
	go() {
		logger.info('bootstrapping validator');

		const signKey = seedToSignKey(this.options.VALIDATOR_SEED);

		logger.info('signer identity %s', signKey.public);

		const connections = {
			home: new Web3(new HDWalletProvider(
				process.env.VALIDATOR_SEED,
				this.options.HOME_URL
			)),
			foreign: new Web3(new HDWalletProvider(
				process.env.VALIDATOR_SEED,
				this.options.FOREIGN_URL
			))
		}

		const bridges = {}
		bridges.home = new HomeBridgeWatcher(this.options, connections, bridges, signKey);
		bridges.foreign = new ForeignBridgeWatcher(this.options, connections, bridges, signKey);

	}
}
module.exports = BridgeValidator;
