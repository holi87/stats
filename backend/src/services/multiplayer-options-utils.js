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

function normalizeOptionToken(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isBaseGameOption(option) {
  if (!option || typeof option !== 'object') {
    return false;
  }

  const codeToken = normalizeOptionToken(option.code);
  const displayNameToken = normalizeOptionToken(option.displayName || option.display_name);

  return BASE_OPTION_TOKENS.has(codeToken) || BASE_OPTION_TOKENS.has(displayNameToken);
}

module.exports = {
  isBaseGameOption,
};

