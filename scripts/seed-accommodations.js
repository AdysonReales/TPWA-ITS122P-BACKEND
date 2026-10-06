require('dotenv').config();

const { resolveLocation } = require('../utils/locationResolver');
const {
  createDemoAccommodationRecords,
  ensureDemoAccommodations,
} = require('../services/demoAccommodation.service');

const DEMO_LOCATIONS = [
  { country: 'Japan', area: 'Tokyo' },
  { country: 'Japan', area: 'Osaka' },
  { country: 'Japan', area: 'Kyoto' },
  { country: 'South Korea', area: 'Seoul' },
  { country: 'South Korea', area: 'Busan' },
  { country: 'South Korea', area: 'Jeju' },
  { country: 'Taiwan', area: 'Taipei' },
  { country: 'Singapore', area: 'Singapore' },
  { country: 'Philippines', area: 'Manila' },
  { country: 'Philippines', area: 'Cebu' },
  { country: 'Brunei', area: 'Bandar Seri Begawan' },
  { country: 'Philippines', area: 'El Nido' },
  { country: 'Philippines', area: 'Coron' },
  { country: 'Philippines', area: 'Batanes' },
  { country: 'France', area: 'Paris' },
  { country: 'Italy', area: 'Rome' },
  { country: 'United States', area: 'New York City' },
  { country: 'Japan', area: 'Hakone' },
  { country: 'France', area: 'Versailles' },
  { country: 'France', area: 'Nice' },
  { country: 'France', area: 'Cannes' },
  { country: 'Italy', area: 'Florence' },
  { country: 'Italy', area: 'Tuscany' },
  { country: 'Italy', area: 'Venice' },
  { country: 'Italy', area: 'Positano' },
  { country: 'United States', area: 'Grand Canyon' },
  { country: 'United States', area: 'Maui' },
  // Open-data resolution verified for Indonesia / Bali.
  { country: 'Indonesia', area: 'Bali' },
];

function databaseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { valid: false, reason: 'DATABASE_URL is not configured.' };
  try {
    const parsed = new URL(raw);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (!parsed.hostname || !database || /^(host|example|localhost-placeholder)$/i.test(parsed.hostname) || /^(dbname|database)$/i.test(database)) {
      return { valid: false, reason: 'DATABASE_URL contains a placeholder or incomplete target.' };
    }
    return {
      valid: true,
      confirmation: `${parsed.hostname}/${database}`,
      local: ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
      hasPlaceholderCredentials: /^(user|username)$/i.test(user) || /^(password|your_password)$/i.test(password),
    };
  } catch {
    return { valid: false, reason: 'DATABASE_URL is not a valid connection URL.' };
  }
}

function parseArgs(args) {
  return {
    dryRun: args.includes('--dry-run') || !args.includes('--execute'),
    execute: args.includes('--execute'),
    confirmTarget: args.find((arg) => arg.startsWith('--confirm-target='))?.slice('--confirm-target='.length) || '',
  };
}

async function resolveDemoProperties() {
  const locations = [];
  const plans = [];
  const unresolved = [];
  const seen = new Set();

  for (const configured of DEMO_LOCATIONS) {
    const resolution = await resolveLocation(configured.country, configured.area);
    if (resolution.status !== 'resolved') {
      unresolved.push(`${configured.country} / ${configured.area}: ${resolution.status}`);
      console.error(`UNRESOLVED ${configured.country} / ${configured.area}: ${resolution.status}`);
      continue;
    }

    const location = resolution.location;
    const key = `${location.country.toLowerCase()}|${location.area.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push(location);
    plans.push(...createDemoAccommodationRecords(location));
    console.log(`RESOLVED ${configured.country} / ${configured.area} -> ${location.country} / ${location.area}`);
  }

  return { locations, plans, unresolved };
}

async function readExisting(pool, plan) {
  const result = await pool.query(
    `SELECT id, is_demo FROM accommodations
     WHERE LOWER(BTRIM(country)) = LOWER($1)
       AND LOWER(BTRIM(area)) = LOWER($2)
       AND LOWER(BTRIM(name)) = LOWER($3)
     ORDER BY id LIMIT 1`,
    [plan.country, plan.area, plan.name]
  );
  return result.rows[0] || null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = databaseTarget();
  const { locations, plans, unresolved } = await resolveDemoProperties();

  console.log('\nDemo accommodation prices are project seed values and are not live hotel rates.');
  console.log(`Resolved ${locations.length} explicit locations; ${plans.length} accommodation rows planned.`);
  console.log('Price rule (whole PHP): centralized base + country tier + area tier + property tier.');

  if (options.execute) {
    if (!target.valid || target.hasPlaceholderCredentials || options.confirmTarget !== target.confirmation) {
      console.error('SEED SCRIPT READY — DATABASE TARGET REQUIRES CONFIRMATION');
      console.error(`Configured target: ${target.valid ? target.confirmation : target.reason}`);
      console.error('Use --execute --confirm-target=<exact-host>/<database> only after independently confirming the target is non-production.');
      process.exitCode = 2;
      return;
    }
    if (unresolved.length) {
      console.error(`SEED BLOCKED: ${unresolved.length} configured locations are unresolved; no database changes were made.`);
      process.exitCode = 2;
      return;
    }
  }

  const exactTargetConfirmed = target.valid && options.confirmTarget === target.confirmation;
  const mayInspectDatabase = target.valid && !target.hasPlaceholderCredentials && (target.local || exactTargetConfirmed);
  const pool = mayInspectDatabase ? require('../config/db') : null;
  let created = 0;
  let alreadyPresent = 0;
  let skipped = 0;

  try {
    if (pool && options.dryRun) {
      for (const plan of plans) {
        const existing = await readExisting(pool, plan);
        if (existing?.is_demo) {
          alreadyPresent += 1;
          console.log(`ALREADY PRESENT ${plan.country} / ${plan.area} / ${plan.name}`);
        } else if (existing) {
          skipped += 1;
          console.log(`SKIPPED non-demo ${plan.country} / ${plan.area} / ${plan.name}`);
        } else {
          console.log(`TO CREATE ${plan.country} / ${plan.area} / ${plan.name}`);
        }
      }
    } else if (pool && options.execute) {
      for (const location of locations) {
        const result = await ensureDemoAccommodations(pool, location.country, location.area, location.region);
        if (result.generated) created += result.generated;
        else alreadyPresent += result.accommodations.length;
        console.log(`${result.generated ? 'GENERATED' : 'ALREADY PRESENT'} ${location.country} / ${location.area}: ${result.accommodations.length} active properties`);
      }
    } else {
      for (const plan of plans) {
        console.log(`${options.dryRun ? 'TO CREATE' : 'NOT EXECUTED'} ${plan.country} / ${plan.area} / ${plan.name} — ₱${plan.price.toLocaleString('en-PH')}`);
      }
      console.log('ALREADY PRESENT: not checked; database inspection requires a local target or exact --confirm-target=<host>/<database>.');
    }
  } finally {
    if (pool) await pool.end();
  }

  console.log(`\nSummary: created=${created}, already_present=${alreadyPresent}, skipped=${skipped}, unresolved=${unresolved.length}.`);
}

main().catch((error) => {
  console.error(`Seed planning failed: ${error.message}`);
  process.exitCode = 1;
});
