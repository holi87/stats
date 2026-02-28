function parseBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

const featureFlags = {
  olympicRanking: parseBooleanFlag(process.env.FEATURE_OLYMPIC_RANKING, true),
  simpleTmMode: parseBooleanFlag(process.env.FEATURE_SIMPLE_TM_MODE, true),
  multiOptionsMode: parseBooleanFlag(process.env.FEATURE_MULTI_OPTIONS_MODE, true),
  adminDataExportEnabled: parseBooleanFlag(process.env.FEATURE_ADMIN_DATA_EXPORT, true),
  adminDataImportEnabled: parseBooleanFlag(
    process.env.FEATURE_ADMIN_DATA_IMPORT,
    process.env.NODE_ENV !== 'production'
  ),
  adminDataImportApplyEnabled: parseBooleanFlag(
    process.env.FEATURE_ADMIN_DATA_IMPORT_APPLY,
    process.env.NODE_ENV !== 'production'
  ),
};

module.exports = {
  featureFlags,
  parseBooleanFlag,
};
