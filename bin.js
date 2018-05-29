#!/usr/bin/env node
'use strict';

const BridgeValidatorCli = require('./src/lib/bridgevalidator-cli.js');
const cli = new BridgeValidatorCli();
cli.go();
