'use strict';

/**
 * the processor for the command line interface
 *
 */
class BridgeValidatorCli {
	/**
	 * construtor
	 *
	 */
	constructor() {
		this.stdout = process.stdout;
	}

	/**
	 * Creates the ipfsconsortium class
	 * Sets up the options from ENV, .ENV file or commandline
	 * Starts the Proxy.
	 *
	 * @param      {Object}  argv    command line parameter set
	 */
	go(argv) {
		// mixin the environment variables defined in .env
		require('dotenv').config({
			path: '.env',
		});

		const tool = require('command-line-tool');
		const cliData = require('./cli-data');
		const BridgeValidator = require('../bridgevalidator.js');

		const cli = tool.getCli(cliData.definitions, cliData.usageSections, argv);

		let options = {
			mainWebsocketURL: cli.options.mainweb3hostws || process.env.MAINWEB3HOSTWS,
			mainContractAddress: cli.options.maincontractaddress || process.env.MAINCONTRACTADDRESS,
			foreignWebsocketURL: cli.options.foreignweb3hostws || process.env.FOREIGNWEB3HOSTWS,
			foreignContractAddress: cli.options.foreigncontractaddress || process.env.FOREIGNCONTRACTADDRESS,
			keyFile: cli.options.keyfile || process.env.KEYFILE,
			startBlockMain: cli.options.startblockmain || process.env.STARTBLOCKMAIN,
			startBlockForeign: cli.options.startblockforeign || process.env.STARTBLOCKFOREIGN,
			pollInterval: cli.options.pollinterval || process.env.POLLINTERVAL || 10000,
			rescan: cli.options.rescan,
		};

		if (!options.mainWebsocketURL ||
			!options.mainContractAddress ||
			!options.foreignWebsocketURL ||
			!options.foreignContractAddress ||
			!options.keyFile
		) {
			options.help = true;
			console.log(options);
		}

		if (options.help) {
			const os = require('os');
			this.stdout.write(cli.usage + os.EOL);
			return;
		}

		const instance = new BridgeValidator(options);
		instance.go();
	}
}

module.exports = BridgeValidatorCli;
