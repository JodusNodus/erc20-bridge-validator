'use strict';

exports.definitions = [{
	name: 'mainWebsocketURL',
	type: String,
	description: 'the URL of your mainchain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'mainContractAddress',
	type: String,
	description: 'mainchain bridge contract address.',
}, {
	name: 'foreignWebsocketURL',
	type: String,
	description: 'the URL of your sidechain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'foreignContractAddress',
	type: String,
	description: 'sidechain bridge contract address.',
}, {
	name: 'keyFile',
	type: String,
	description: 'file containing the Ethereum key to sign bridge requests with.',
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
