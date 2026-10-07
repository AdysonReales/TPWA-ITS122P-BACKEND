const {
  getCountries,
  getAllCitiesOfCountry,
  getStatesOfCountry,
} = require('@countrystatecity/countries');
const { normalizeCountry, normalizeLookup } = require('./accommodationLocation');

function asCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toCandidate(record, country, region, type) {
  return {
    country: country.name,
    country_code: country.iso2,
    area: record.name,
    region: region?.name || (type === 'region' ? record.name : null),
    latitude: asCoordinate(record.latitude),
    longitude: asCoordinate(record.longitude),
    match_type: type,
  };
}

async function resolveLocation(countryInput, areaInput, regionHint) {
  const countryName = normalizeCountry(countryInput);
  const areaName = normalizeLookup(areaInput);
  if (!countryName || !areaName) return { status: 'not_found' };

  const countries = await getCountries();
  const country = countries.find((item) =>
    normalizeLookup(item.name) === normalizeLookup(countryName) ||
    normalizeLookup(item.iso2) === normalizeLookup(countryInput)
  );
  if (!country) return { status: 'not_found' };

  const [cities, states] = await Promise.all([
    getAllCitiesOfCountry(country.iso2),
    getStatesOfCountry(country.iso2),
  ]);
  const citySearchNames = [areaName];
  if (areaName.endsWith(' island')) citySearchNames.push(areaName.replace(/\s+island$/, ''));
  const matchingCities = cities.filter((city) => citySearchNames.includes(normalizeLookup(city.name)));
  const matchingStates = states.filter((state) => citySearchNames.includes(normalizeLookup(state.name)));
  const hint = normalizeLookup(regionHint);

  let candidates;
  if (matchingCities.length) {
    candidates = matchingCities.map((city) => {
      const region = states.find((state) => state.iso2 === city.state_code || state.id === city.state_id) || null;
      return toCandidate(city, country, region, 'city');
    });
  } else {
    candidates = matchingStates.map((state) => toCandidate(state, country, state, 'region'));
  }

  // Broad, Mapbox-labeled regions such as "Northeast Ohio" are not city
  // records. Resolve only when their trailing geographic name uniquely
  // identifies a canonical state/region from the reference dataset. Keep the
  // submitted label separately in destinations.location_name; coordinates and
  // accommodation lookup use this canonical state record.
  if (!candidates.length) {
    const areaWithoutDescriptor = areaName.replace(/\s+(region|area|state|province)$/, '');
    const containingRegions = states.filter((state) => {
      const stateName = normalizeLookup(state.name);
      return areaWithoutDescriptor.endsWith(` ${stateName}`) && stateName !== areaWithoutDescriptor;
    });
    const hintedState = hint
      ? states.find((state) => normalizeLookup(state.name) === hint)
      : null;
    const safeRegion = containingRegions.length === 1 &&
      (!hintedState || hintedState.id === containingRegions[0].id)
      ? containingRegions[0]
      : null;
    if (safeRegion) candidates = [toCandidate(safeRegion, country, safeRegion, 'region')];
  }

  if (hint && candidates.length > 1) {
    candidates = candidates.filter((candidate) => normalizeLookup(candidate.region) === hint);
  }
  const distinct = candidates.filter((candidate, index, list) =>
    list.findIndex((other) => other.latitude === candidate.latitude && other.longitude === candidate.longitude && other.region === candidate.region) === index
  );

  if (distinct.length > 1) return { status: 'ambiguous', candidates: distinct };
  if (!distinct.length) return { status: 'not_found' };
  const location = distinct[0];
  delete location.match_type;
  return {
    status: 'resolved',
    location,
    ...(location.latitude === null || location.longitude === null ? { warning: 'OPEN LOCATION COORDINATES MISSING' } : {}),
  };
}

module.exports = { resolveLocation };
