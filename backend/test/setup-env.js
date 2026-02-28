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

if (!process.env.FEATURE_OLYMPIC_RANKING) {
  process.env.FEATURE_OLYMPIC_RANKING = 'true';
}

if (!process.env.FEATURE_SIMPLE_TM_MODE) {
  process.env.FEATURE_SIMPLE_TM_MODE = 'true';
}

if (!process.env.FEATURE_MULTI_OPTIONS_MODE) {
  process.env.FEATURE_MULTI_OPTIONS_MODE = 'true';
}
