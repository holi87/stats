const express = require('express');
const {
  validationError,
  forbidden,
  notFound,
  conflict,
  tooManyRequests,
} = require('../errors');
const { featureFlags } = require('../feature-flags');
const {
  fetchDataExportSnapshot,
  prepareDataImport,
  applyPreparedDataImport,
} = require('../services/admin-data-transfer-service');

const router = express.Router();

const PROD_IMPORT_CONFIRMATION = 'IMPORT_PROD_CONFIRM';
const importWritesByKey = new Map();

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getConfiguredAdminToken() {
  const token = process.env.ADMIN_TOKEN;
  if (typeof token !== 'string') {
    return '';
  }
  return token.trim();
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

  if (typeof provided !== 'string' || provided !== token) {
    throw forbidden('Admin access token is invalid');
  }
}

function estimateBodySizeBytes(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body || {}), 'utf8');
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function getImportMaxBytes() {
  const fallback = isProduction() ? 2 * 1024 * 1024 : 10 * 1024 * 1024;
  return parsePositiveInt(process.env.ADMIN_IMPORT_MAX_BYTES, fallback);
}

function getRequestLimiterKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim() !== '') {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0] || '').trim();
  }

  if (typeof req.ip === 'string' && req.ip.trim() !== '') {
    return req.ip;
  }

  return 'unknown';
}

function consumeImportWriteRateLimit(req) {
  if (!isProduction()) {
    return true;
  }

  const maxWrites = parsePositiveInt(process.env.ADMIN_IMPORT_WRITE_LIMIT, 5);
  const windowMs = parsePositiveInt(process.env.ADMIN_IMPORT_WRITE_WINDOW_MS, 5 * 60 * 1000);

  const now = Date.now();
  const key = getRequestLimiterKey(req);
  const rawBucket = importWritesByKey.get(key) || [];
  const freshBucket = rawBucket.filter((timestamp) => now - timestamp < windowMs);

  if (freshBucket.length >= maxWrites) {
    importWritesByKey.set(key, freshBucket);
    return false;
  }

  freshBucket.push(now);
  importWritesByKey.set(key, freshBucket);
  return true;
}

router.get('/admin/data/export', async (req, res, next) => {
  try {
    if (!featureFlags.adminDataExportEnabled) {
      return next(notFound('Endpoint not found'));
    }

    requireAdminAccess(req);

    const payload = await fetchDataExportSnapshot();
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="game-stats-export-${safeTimestamp}.json"`
    );

    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
});

router.post('/admin/data/import', async (req, res, next) => {
  try {
    if (!featureFlags.adminDataImportEnabled) {
      return next(notFound('Endpoint not found'));
    }

    requireAdminAccess(req);

    const details = [];
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(
        validationError([{ field: 'body', message: 'must be an object with dryRun and payload' }])
      );
    }

    const { dryRun = true, payload, confirmation } = req.body;

    if (typeof dryRun !== 'boolean') {
      details.push({ field: 'dryRun', message: 'must be a boolean' });
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      details.push({ field: 'payload', message: 'must be an object' });
    }

    const bodySizeBytes = estimateBodySizeBytes(payload);
    const maxBytes = getImportMaxBytes();
    if (bodySizeBytes > maxBytes) {
      details.push({
        field: 'payload',
        message: `payload exceeds maximum size of ${maxBytes} bytes`,
      });
    }

    const dryRunEnabled = dryRun === true;
    if (!dryRunEnabled && !featureFlags.adminDataImportApplyEnabled) {
      return next(conflict('Import write mode is disabled by feature flag'));
    }

    if (!dryRunEnabled && isProduction()) {
      if (confirmation !== PROD_IMPORT_CONFIRMATION) {
        details.push({
          field: 'confirmation',
          message: `must equal ${PROD_IMPORT_CONFIRMATION} for production write import`,
        });
      }

      if (!consumeImportWriteRateLimit(req)) {
        return next(
          tooManyRequests('Too many import attempts. Try again later or use dry-run first.')
        );
      }
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    let prepared;
    try {
      prepared = await prepareDataImport(payload);
    } catch (error) {
      if (error && error.code === 'DATA_IMPORT_VALIDATION_FAILED') {
        if (Array.isArray(error.warnings) && error.warnings.length > 0) {
          console.warn('[admin-data-import] validation warnings:', error.warnings);
        }
        console.warn('[admin-data-import] validation failed with details count:', error.details?.length || 0);
        return next(validationError(error.details || []));
      }
      throw error;
    }

    if (dryRunEnabled) {
      return res.status(200).json({
        dryRun: true,
        summary: prepared.summary,
        warnings: prepared.warnings,
        confirmationRequired: isProduction(),
        confirmationToken: isProduction() ? PROD_IMPORT_CONFIRMATION : null,
      });
    }

    const applyResult = await applyPreparedDataImport(prepared);
    return res.status(201).json({
      dryRun: false,
      summary: prepared.summary,
      warnings: prepared.warnings,
      appliedAt: applyResult.appliedAt,
      confirmationRequired: false,
      confirmationToken: null,
    });
  } catch (error) {
    console.error('[admin-data-import] unexpected error:', error);
    return next(error);
  }
});

module.exports = router;
