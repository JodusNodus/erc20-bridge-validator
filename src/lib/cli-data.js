'use strict';

exports.definitions = [{
	name: 'mainweb3hostws',
	type: String,
	description: 'the URL of your mainchain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'maincontractaddress',
	type: String,
	description: 'mainchain bridge contract address.',
}, {
	name: 'foreignweb3hostws',
	type: String,
	description: 'the URL of your sidechain Ethereum node WS. ex. "ws://localhost:8546"',
}, {
	name: 'foreigncontractaddress',
	type: String,
	description: 'sidechain bridge contract address.',
}, {
	name: 'keyfile',
	type: String,
	description: 'file containing the Ethereum key to sign bridge requests with.',
}, {
	name: 'startblock',
	type: Number,
	description: 'startblock where to start listening (or current block if not specified)',
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
