const COUNTRY_ALIASES = new Map([
  ['japan', 'Japan'],
  ['jp', 'Japan'],
  ['south korea', 'South Korea'],
  ['korea', 'South Korea'],
  ['republic of korea', 'South Korea'],
  ['republic of korea south', 'South Korea'],
  ['korea republic of', 'South Korea'],
  ['kr', 'South Korea'],
  ['singapore', 'Singapore'],
  ['sg', 'Singapore'],
  ['taiwan', 'Taiwan'],
  ['tw', 'Taiwan'],
  ['hong kong', 'Hong Kong'],
  ['hong kong sar', 'Hong Kong'],
  ['hong kong special administrative region', 'Hong Kong'],
  ['macau', 'Macau'],
  ['macao', 'Macau'],
]);

function normalizeCountry(value) {
  const normalized = normalizeLookup(value);
  return COUNTRY_ALIASES.get(normalized) || (normalized ? normalized.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : '');
}

function countryQueryVariants(value) {
  const canonical = normalizeCountry(value);
  const variants = {
    'Japan': ['japan', 'jp'],
    'South Korea': ['south korea', 'korea', 'republic of korea', 'kr'],
    'Singapore': ['singapore', 'sg'],
    'Taiwan': ['taiwan', 'tw'],
  };
  return variants[canonical] || [canonical.toLowerCase()];
}

function normalizeArea(value) {
  return normalizeLookup(value);
}

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getDestinationLocation(destination) {
  const label = String(destination.location_name || '').trim().replace(/\s+/g, ' ');
  const parts = label.split(',').map((part) => part.trim()).filter(Boolean);
  const countryFromLabel = parts.length > 1 ? parts[parts.length - 1] : '';
  const country = normalizeCountry(destination.country || countryFromLabel);
  let area = label;
  if (destination.country && parts.length > 1 && normalizeCountry(parts[parts.length - 1]) === country) {
    area = parts.slice(0, -1).join(', ');
  } else if (!destination.country && parts.length > 1) {
    area = parts.slice(0, -1).join(', ');
  }
  return { country, area };
}

module.exports = { normalizeCountry, normalizeArea, normalizeLookup, countryQueryVariants, getDestinationLocation };
