// The backend and the Python security module must use identical gate rules.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pythonConfig = path.join(__dirname, '..', '..', 'security', 'config.json');

test('config/gateDefaults.json matches security/config.json', { skip: !fs.existsSync(pythonConfig) }, () => {
  const python = JSON.parse(fs.readFileSync(pythonConfig, 'utf8'));
  const backend = require('../config/gateDefaults.json');
  assert.deepStrictEqual(backend, python);
});
