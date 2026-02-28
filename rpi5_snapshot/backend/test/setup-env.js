const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const testEnvPath = path.join(__dirname, '..', '.env.test');
const defaultEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
} else if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath });
} else {
  dotenv.config();
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
