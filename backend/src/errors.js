const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }
}

function validationError(details, message = 'Validation failed') {
  return new ApiError({
    status: 400,
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    details,
  });
}

function notFound(message = 'Resource not found') {
  return new ApiError({
    status: 404,
    code: ERROR_CODES.NOT_FOUND,
    message,
    details: [],
  });
}

function conflict(message = 'Conflict') {
  return new ApiError({
    status: 409,
    code: ERROR_CODES.CONFLICT,
    message,
    details: [],
  });
}

function forbidden(message = 'Forbidden') {
  return new ApiError({
    status: 403,
    code: ERROR_CODES.FORBIDDEN,
    message,
    details: [],
  });
}

function tooManyRequests(message = 'Too many requests') {
  return new ApiError({
    status: 429,
    code: ERROR_CODES.TOO_MANY_REQUESTS,
    message,
    details: [],
  });
}

function internalError() {
  return new ApiError({
    status: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Internal server error',
    details: [],
  });
}

module.exports = {
  ERROR_CODES,
  ApiError,
  validationError,
  notFound,
  conflict,
  forbidden,
  tooManyRequests,
  internalError,
};
