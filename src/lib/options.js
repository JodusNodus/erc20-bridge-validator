'use strict';

exports.definitions = [{
	name: 'HOME_URL',
	description: 'the URL of your home net Ethereum node',
	required: true
}, {
	name: 'FOREIGN_URL',
	description: 'the URL of your foreign net Ethereum node',
	required: true
}, {
	name: 'HOME_BRIDGE',
	description: 'mainchain bridge contract address.',
	required: true
}, {
	name: 'FOREIGN_BRIDGE',
	description: 'sidechain bridge contract address.',
	required: true
}, {
	name: 'VALIDATOR_SEED',
	description: 'Hardware wallet seed of registered validator',
	required: true
}, {
	name: 'START_BLOCK_HOME',
	type: Number,
	description: 'startblock where to start listening on main chain (or current block if not specified)',
}, {
	name: 'START_BLOCK_FOREIGN',
	type: Number,
	description: 'startblock where to start listening on foreign chain (or current block if not specified)',
}, {
	name: 'POLL_INTERVAL',
	type: Number,
	description: 'interval in ms to poll bridges for events',
	default: 5000
}, {
	name: 'RESCAN',
	type: Boolean,
	description: 're-scan range from startblock',
	default: false
}];