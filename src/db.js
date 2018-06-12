'use strict';

// wraps db in a singleton object for re-use across the API

const level = require('level');
let db;

// for the interface of this , refer to
// https://www.npmjs.com/package/level#api
module.exports = function(scope) {
	if (!db) {
		db = level(__dirname + '/.localCache-' + scope);
	}
	return db;
};
