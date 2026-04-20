"use strict";

const entry = require("./index.js");

module.exports = {
  ...entry,
  fetch: entry.fetch || entry.handleFetchRequest,
  handler: entry.handler || entry.handleFetchRequest,
};
