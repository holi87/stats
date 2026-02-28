const { validationError } = require('./errors');

function validateObject(payload, schema) {
  const details = [];

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return [{ field: 'body', message: 'must be an object' }];
  }

  for (const [field, rules] of Object.entries(schema)) {
    const value = payload[field];
    const isMissing = value === undefined;

    if (value === null) {
      if (rules.nullable) {
        continue;
      }
      if (rules.required) {
        details.push({ field, message: 'is required' });
      } else {
        details.push({ field, message: 'must not be null' });
      }
      continue;
    }

    if (isMissing) {
      if (rules.required) {
        details.push({ field, message: 'is required' });
      }
      continue;
    }

    switch (rules.type) {
      case 'string':
        if (typeof value !== 'string') {
          details.push({ field, message: 'must be a string' });
          break;
        }
        const valueToCheck = rules.trim ? value.trim() : value;
        if (rules.minLength !== undefined && valueToCheck.length < rules.minLength) {
          details.push({ field, message: `must be at least ${rules.minLength} characters` });
        }
        if (rules.maxLength !== undefined && valueToCheck.length > rules.maxLength) {
          details.push({ field, message: `must be at most ${rules.maxLength} characters` });
        }
        if (rules.pattern && !rules.pattern.test(valueToCheck)) {
          details.push({ field, message: 'has invalid format' });
        }
        if (rules.enum && !rules.enum.includes(valueToCheck)) {
          details.push({ field, message: 'must be one of allowed values' });
        }
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          details.push({ field, message: 'must be a number' });
          break;
        }
        if (rules.integer && !Number.isInteger(value)) {
          details.push({ field, message: 'must be an integer' });
          break;
        }
        if (rules.min !== undefined && value < rules.min) {
          details.push({ field, message: `must be >= ${rules.min}` });
        }
        if (rules.max !== undefined && value > rules.max) {
          details.push({ field, message: `must be <= ${rules.max}` });
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          details.push({ field, message: 'must be a boolean' });
        }
        break;
      default:
        break;
    }
  }

  return details;
}

function validateBody(schema) {
  return (req, _res, next) => {
    const payload = req.body === undefined ? {} : req.body;
    const details = validateObject(payload, schema);
    if (details.length > 0) {
      return next(validationError(details));
    }
    return next();
  };
}

module.exports = {
  validateBody,
  validateObject,
};
