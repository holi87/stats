const crypto = require('node:crypto');
const { ApiError, forbidden, internalError, notFound, validationError } = require('./errors');

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8501',
  'http://127.0.0.1:8501',
];
const METHODS_REQUIRING_ADMIN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function getConfiguredAdminToken() {
  const token = process.env.ADMIN_TOKEN;
  return typeof token === 'string' ? token.trim() : '';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdminAccess(req) {
  const token = getConfiguredAdminToken();

  if (isProduction() && !token) {
    throw forbidden('Admin access is not configured on server');
  }

  if (!token) {
    return;
  }

  const headerValue = req.headers['x-admin-token'];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof provided !== 'string' || !timingSafeStringEqual(provided, token)) {
    throw forbidden('Admin access token is invalid');
  }
}

function requireAdminWriteAccess(req, _res, next) {
  if (!METHODS_REQUIRING_ADMIN.has(req.method)) {
    return next();
  }

  try {
    requireAdminAccess(req);
    return next();
  } catch (error) {
    return next(error);
  }
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
  requireAdminAccess,
  requireAdminWriteAccess,
  notFoundHandler,
  errorHandler,
};
