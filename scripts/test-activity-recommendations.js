const assert = require('node:assert/strict');
const { PLACE_DATA, parseRows } = require('./seed-activity-recommendations');

const groups = PLACE_DATA.split(/\r?\n/).map((line) => line.split('|'));
const recommendations = parseRows();
const byPlace = new Map();
for (const item of recommendations) {
  const key = `${item.country.toLowerCase()}|${item.destinationName.toLowerCase()}`;
  byPlace.set(key, (byPlace.get(key) || 0) + 1);
}

assert.ok(groups.length >= 50, 'Expected broad Explore destination coverage.');
assert.ok(recommendations.length >= groups.length * 5);
assert.equal(byPlace.size, groups.length, 'Place seed keys must be unique.');
for (const [place, count] of byPlace) {
  assert.ok(count >= 5 && count <= 10, `${place} has ${count} activities.`);
}
assert.equal(new Set(recommendations.map((item) =>
  `${item.country.toLowerCase()}|${item.destinationName.toLowerCase()}|${item.title.toLowerCase()}`,
)).size, recommendations.length, 'Recommendation titles must not duplicate within a place.');
assert.ok(recommendations.every((item) => item.title.length <= 180));
assert.ok(!recommendations.some((item) => /^(sightseeing|culture|nature|food|entertainment|recreation)$/i.test(item.title)));

const priorityPlaces = [
  ['Philippines', 'Manila'], ['Philippines', 'Cebu City'], ['Philippines', 'Bohol'],
  ['Philippines', 'Baguio'], ['Philippines', 'El Nido, Palawan'], ['Philippines', 'Coron, Palawan'],
  ['Japan', 'Tokyo'], ['Japan', 'Kyoto'], ['Japan', 'Osaka'],
  ['South Korea', 'Seoul'], ['South Korea', 'Busan'], ['South Korea', 'Jeju Island'],
  ['Taiwan', 'Taipei'], ['Malaysia', 'Kuala Lumpur'], ['Malaysia', 'Penang'],
  ['Singapore', 'Singapore'], ['Thailand', 'Bangkok'], ['Thailand', 'Chiang Mai'],
  ['Thailand', 'Phuket'], ['Indonesia', 'Bali'], ['Indonesia', 'Jakarta'],
  ['Indonesia', 'Yogyakarta'], ['Vietnam', 'Hanoi'], ['Vietnam', 'Ho Chi Minh City'],
  ['Vietnam', 'Da Nang'], ['China', 'Beijing'], ['China', 'Shanghai'], ['China', 'Chengdu'],
  ['Hong Kong', 'Hong Kong'],
];
for (const [country, destination] of priorityPlaces) {
  assert.ok(
    byPlace.get(`${country.toLowerCase()}|${destination.toLowerCase()}`) >= 5,
    `${country} / ${destination} must have at least five named recommendations.`,
  );
}

console.log(`Activity recommendation data checks passed: ${groups.length} places, ${recommendations.length} named activities.`);
