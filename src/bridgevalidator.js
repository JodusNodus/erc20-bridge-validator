// 'use strict';
//import logger from './logs';
//import bridgelib from '../../erc20-bridge/bridgelib';
//import foreignBridge from './foreignBridge';

const bridgelib = require('../../erc20-bridge/bridgelib');
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

		const signKey = require(this.options.keyFile);
		logger.info('signer identity %s', signKey.public);

		this.foreignBridgeWatcher = new ForeignBridgeWatcher(this.options, signKey);

	}
}
module.exports = BridgeValidator;
