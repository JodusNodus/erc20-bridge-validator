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
			MAINWEB3HOSTWS: cli.options.mainweb3hostws || process.env.MAINWEB3HOSTWS,
			MAINCONTRACTADDRESS: cli.options.maincontractaddress || process.env.MAINCONTRACTADDRESS,
			FOREIGNWEB3HOSTWS: cli.options.foreignweb3hostws || process.env.FOREIGNWEB3HOSTWS,
			FOREIGNCONTRACTADDRESS: cli.options.foreigncontractaddress || process.env.FOREIGNCONTRACTADDRESS,
			KEYFILE: cli.options.keyfile || process.env.KEYFILE,
			STARTBLOCKMAIN: cli.options.startblockmain || process.env.STARTBLOCKMAIN,
			STARTBLOCKFOREIGN: cli.options.startblockforeign || process.env.STARTBLOCKFOREIGN,
			POLLINTERVAL: cli.options.pollinterval || process.env.POLLINTERVAL,
			RESCAN: cli.options.rescan,

		};

		if (!options.MAINWEB3HOSTWS ||
			!options.MAINCONTRACTADDRESS ||
			!options.FOREIGNWEB3HOSTWS ||
			!options.FOREIGNCONTRACTADDRESS ||
			!options.KEYFILE ||
			!options.POLLINTERVAL
		) {
			options.help = true;
			console.log(options);
		}

		if (options.help) {
			const os = require('os');
			this.stdout.write(cli.usage + os.EOL);
			return;
		}

		const instance = new BridgeValidator(
			options.MAINWEB3HOSTWS,
			options.MAINCONTRACTADDRESS,
			options.FOREIGNWEB3HOSTWS,
			options.FOREIGNCONTRACTADDRESS,
			options.KEYFILE,
			options.STARTBLOCKMAIN,
			options.STARTBLOCKFOREIGN,
			options.POLLINTERVAL,
			options.RESCAN,
		);
		instance.go();
	}
}

module.exports = BridgeValidatorCli;
