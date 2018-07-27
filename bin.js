#!/usr/bin/env node
'use strict';

const optionsLoader = require('./src/lib/optionsLoader');
const BridgeValidator = require('./src/bridgevalidator');

const options = optionsLoader();
const instance = new BridgeValidator(options);
instance.go();