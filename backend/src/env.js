function loadEnv() {
  if (process.env.NODE_ENV !== 'production') {
    // Local dev convenience; Docker Compose passes env vars directly.
    // eslint-disable-next-line global-require
    require('dotenv').config();
  }
}

module.exports = {
  loadEnv,
};
