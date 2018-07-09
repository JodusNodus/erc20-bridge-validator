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

	getOptionValue(key, cli) {
		const cliVal = cli.options[key]
		const envVal = process.env[key.toUpperCase()]
		return cliVal === undefined ? envVal : cliVal
	}

	/**
	 * Creates the ipfsconsortium class
	 * Sets up the options from ENV, .ENV file or commandline
	 * Starts the Proxy.
	 *
	 * @param      {Object}  argv    command line parameter set
	 */
	go(argv) {
		const tool = require('command-line-tool');
		const cliData = require('./cli-data');
		const BridgeValidator = require('../bridgevalidator.js');

		const cli = tool.getCli(cliData.definitions, cliData.usageSections, argv);

		const options = {
			// Defaults
			pollInterval: 10000,
			rescan: false,
		}

		cliData.definitions.forEach((def) => {
			const val = this.getOptionValue(def.name, cli)
			if (val !== undefined) {
				options[def.name] = val
			}
		})

		if (!options.mainWebsocketURL ||
			!options.mainContractAddress ||
			!options.foreignWebsocketURL ||
			!options.foreignContractAddress ||
			!options.seed
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
