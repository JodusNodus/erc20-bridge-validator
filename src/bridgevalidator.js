'use strict';

const bridgelib = require('../../erc20-bridge/bridgelib.js');

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
		const {
			createLogger,
			format,
			transports,
		} = require('winston');
		this.logger = createLogger({
			level: 'info',
			format: format.combine(
				format.colorize(),
				format.splat(),
				format.simple()
			),
			transports: [new transports.Console()],
		});
		this.options = options;
	}

	/**
	 * Bootstrap the validator code
	 *
	 */
	go() {
		this.logger.info('bootstrapping validator node');
		const Web3 = require('web3');
		const web3Main = new Web3(new Web3.providers.WebsocketProvider(this.options.MAINWEB3HOSTWS));
		const web3Foreign = new Web3(new Web3.providers.WebsocketProvider(this.options.SIDEWEB3HOSTWS));

		const ERC20 = require('erc20-bridge/build/contracts/ERC20.json');
		const ERC777 = require('erc20-bridge/build/contracts/ReferenceToken.json');
		const HomeERC20Bridge = require('erc20-bridge/build/contracts/HomeERC20Bridge.json');
		const ForeignERC777Bridge = require('erc20-bridge/build/contracts/ForeignERC777Bridge.json');

		const homebridge = new web3Main.eth.Contract(HomeERC20Bridge.abi, this.options.MAINCONTRACTADDRESS);
		const foreignbridge = new web3Foreign.eth.Contract(ForeignERC777Bridge.abi, this.options.MAINCONTRACTADDRESS);

		this.logger.info('setting event listener on homebridge');
		homebridge.events.allEvents({
			fromBlock: this.options.STARTBLOCK,
		}, (error, result) => {
			if (error == null) {
				this.logger.info('Homebridge event=%j', result);
			} else {
				this.logger.error('Error: %s', error.message);
			}
		});
	}
}
module.exports = BridgeValidator;
