'use strict';

exports.definitions = [{
	name: 'mainWS',
	type: String,
	description: 'the URL of your mainchain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'homeBridge',
	type: String,
	description: 'mainchain bridge contract address.',
}, {
	name: 'foreignWS',
	type: String,
	description: 'the URL of your sidechain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'foreignBridge',
	type: String,
	description: 'sidechain bridge contract address.',
}, {
	name: 'seed',
	type: String,
	description: 'validator seed',
}, {
	name: 'startBlockMain',
	type: Number,
	description: 'startblock where to start listening on MAIN chain (or current block if not specified)',
}, {
	name: 'startBlockForeign',
	type: Number,
	description: 'startblock where to start listening on FOREIGN chain (or current block if not specified)',
}, {
	name: 'pollInterval',
	type: Number,
	description: 'interval in ms to poll bridges for events',
}, {
	name: 'rescan',
	type: Boolean,
	description: 're-scan range from startblock',
}, {
	name: 'help',
	type: Boolean,
	alias: 'h',
	description: 'Show usage',
}, ];

exports.usageSections = [{
	header: 'bridgevalidator',
	content: 'ERC20 bridge validator',
}, {
	header: 'Synopsis',
	content: '$ bridgevalidator <options>',
}, {
	header: 'Options',
	optionList: exports.definitions,
}, ];
