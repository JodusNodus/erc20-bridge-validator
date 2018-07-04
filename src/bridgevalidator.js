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
	constructor(MAINWEB3HOSTWS, MAINCONTRACTADDRESS, FOREIGNWEB3HOSTWS,
		FOREIGNCONTRACTADDRESS, KEYFILE, STARTBLOCKMAIN, STARTBLOCKFOREIGN, POLLTIME,RESCAN) {

		this.MAINWEB3HOSTWS = MAINWEB3HOSTWS;
		this.MAINCONTRACTADDRESS = MAINCONTRACTADDRESS;
		this.FOREIGNWEB3HOSTWS = FOREIGNWEB3HOSTWS;
		this.FOREIGNCONTRACTADDRESS = FOREIGNCONTRACTADDRESS;
		this.KEYFILE = KEYFILE;
		this.STARTBLOCKMAIN = STARTBLOCKMAIN;
		this.STARTBLOCKFOREIGN = STARTBLOCKFOREIGN;
		this.POLLTIME = POLLTIME || 2000;
		this.RESCAN = RESCAN;
	}

	/**
	 * Bootstrap the validator code
	 *
	 */
	go() {
		logger.info('bootstrapping validator');

		this.signKey = require(this.KEYFILE);
		logger.info('signer identity %s',this.signKey.public);

		this.foreignBridgeWatcher = new ForeignBridgeWatcher(
			this.MAINWEB3HOSTWS,
			this.FOREIGNWEB3HOSTWS,
			this.MAINCONTRACTADDRESS,
			this.FOREIGNCONTRACTADDRESS,
			this.STARTBLOCKMAIN,
			this.STARTBLOCKFOREIGN,
			this.KEYFILE,
			this.RESCAN
		);

	}
}
module.exports = BridgeValidator;
