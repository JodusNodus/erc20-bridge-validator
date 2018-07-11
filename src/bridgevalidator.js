const Web3 = require("web3");
const Wallet = require('ethereumjs-wallet');
const hdkey = require('ethereumjs-wallet/hdkey');
const HomeBridgeWatcher = require('./HomeBridgeWatcher');
const ForeignBridgeWatcher = require('./ForeignBridgeWatcher');
const logger = require('./logs')(module);

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

		const privateKey = hdkey.fromMasterSeed(this.options.seed)._hdkey._privateKey;
		const wallet = Wallet.fromPrivateKey(privateKey);
		const signKey = { 
			private: wallet.getPrivateKey().toString("hex"),
			public: wallet.getAddressString()
		}

		logger.info('signer identity %s', signKey.public);

		const connections = {
			home: new Web3(new Web3.providers.WebsocketProvider(this.options.mainWS)),
			foreign: new Web3(new Web3.providers.WebsocketProvider(this.options.foreignWS))
		}

		const bridges = {}
		bridges.home = new HomeBridgeWatcher(this.options, connections, bridges, signKey);
		bridges.foreign = new ForeignBridgeWatcher(this.options, connections, bridges, signKey);

	}
}
module.exports = BridgeValidator;
