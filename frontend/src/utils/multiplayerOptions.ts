const BASE_OPTION_TOKENS = new Set([
  'base',
  'base_game',
  'basegame',
  'core',
  'core_game',
  'podstawa',
  'podstawka',
  'gra_podstawowa',
  'podstawowa',
]);

function normalizeOptionToken(value: string | undefined | null) {
  if (!value) {
    return '';
  }

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isBaseGameOption(option: { code?: string | null; displayName?: string | null }) {
  const codeToken = normalizeOptionToken(option.code);
  const nameToken = normalizeOptionToken(option.displayName);
  return BASE_OPTION_TOKENS.has(codeToken) || BASE_OPTION_TOKENS.has(nameToken);
}

