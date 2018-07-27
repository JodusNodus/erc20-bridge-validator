require('dotenv').config();
const { definitions } = require('./options');

module.exports = function () {
	const options = {}

	// Load all options from environment variables
	definitions.forEach(({ name, type = String, default: defaultVal }) => {
		let val = process.env[name]
		if (val == undefined) {
			val = defaultVal;
		} else if (type != String) {
			val = eval(val);
		}
		options[name] = val;
	})

	// Show overview of options if not complete
	const notComplete = definitions
		.find(def => def.required && options[def.name] == undefined)
	if (notComplete) {
		console.log("Options:")
		definitions.forEach(({ name, description, required, default: defaultVal }) => {
			let str = name + ": ";
			if (required) {
				str += "(required) ";
			}
			if (defaultVal) {
				str += `(default=${defaultVal}) `;
			}
			str += description;
			console.log(str)
		})
		process.exit(1);
	}

	return options;
}
