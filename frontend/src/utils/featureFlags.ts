function parseBooleanFlag(value: string | undefined, fallback: boolean) {
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

export const featureFlags = {
  simpleTmMode: parseBooleanFlag(import.meta.env.VITE_FEATURE_SIMPLE_TM_MODE, true),
  multiOptionsMode: parseBooleanFlag(import.meta.env.VITE_FEATURE_MULTI_OPTIONS_MODE, true),
};

export { parseBooleanFlag };
