"use strict";

// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = "tsconfig.json";
// Make ts-node respect the "include" key in tsconfig.json
process.env.TS_NODE_FILES = "TRUE";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", (e) => {
	throw e;
});

// Only the should interface is used (by the generator's dummy test).
// sinon-chai and chai-as-promised were loaded here but are not used anywhere,
// so they and their dependencies are removed instead of being carried along.
const { should } = require("chai");

should();