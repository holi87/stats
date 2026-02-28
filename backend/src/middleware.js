const { ApiError, internalError, notFound, validationError } = require('./errors');

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? [] : DEFAULT_DEV_ORIGINS;
  }
  if (raw === '*') {
    return '*';
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowed = getAllowedOrigins();

  if (allowed === '*') {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  if (origin) {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }

  return next();
}

function requireJsonBody(req, _res, next) {
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  if (!methodsWithBody.has(req.method)) {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return next(
      validationError([{ field: 'body', message: 'Content-Type must be application/json' }])
    );
  }

  return next();
}

function notFoundHandler(req, _res, next) {
  next(notFound('Endpoint not found'));
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    const parseError = validationError([{ field: 'body', message: 'Invalid JSON' }], 'Invalid JSON');
    return res.status(parseError.status).json({
      error: {
        code: parseError.code,
        message: parseError.message,
        details: parseError.details,
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  console.error(err);
  const internal = internalError();

  return res.status(internal.status).json({
    error: {
      code: internal.code,
      message: internal.message,
      details: internal.details,
    },
  });
}

module.exports = {
  corsMiddleware,
  requireJsonBody,
  notFoundHandler,
  errorHandler,
};
