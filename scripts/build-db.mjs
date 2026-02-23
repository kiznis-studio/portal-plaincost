import Database from 'better-sqlite3';
import { readFileSync, existsSync, unlinkSync } from 'fs';

const RAW_DIR = '/storage/plaincost/raw';
const DB_PATH = '/storage/plaincost/plaincost.db';

if (!existsSync(`${RAW_DIR}/msa_rpp.json`)) {
  console.error('Raw data not found. Run fetch-data.mjs first.');
  process.exit(1);
}

if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log('Removed existing database');
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

// BEA uses FIPS state codes. Map them.
const FIPS_TO_ABBR = {};
const entries = [
  ['01','AL'],['02','AK'],['04','AZ'],['05','AR'],['06','CA'],['08','CO'],['09','CT'],
  ['10','DE'],['11','DC'],['12','FL'],['13','GA'],['15','HI'],['16','ID'],['17','IL'],
  ['18','IN'],['19','IA'],['20','KS'],['21','KY'],['22','LA'],['23','ME'],['24','MD'],
  ['25','MA'],['26','MI'],['27','MN'],['28','MS'],['29','MO'],['30','MT'],['31','NE'],
  ['32','NV'],['33','NH'],['34','NJ'],['35','NM'],['36','NY'],['37','NC'],['38','ND'],
  ['39','OH'],['40','OK'],['41','OR'],['42','PA'],['44','RI'],['45','SC'],['46','SD'],
  ['47','TN'],['48','TX'],['49','UT'],['50','VT'],['51','VA'],['53','WA'],['54','WV'],
  ['55','WI'],['56','WY'],
];
for (const [fips, abbr] of entries) {
  FIPS_TO_ABBR[fips] = abbr;
  FIPS_TO_ABBR[fips + '000'] = abbr;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanMsaName(geoName) {
  return geoName.replace(/\s*\(Metropolitan Statistical Area\)/, '').replace(/\s*\(Micropolitan Statistical Area\)/, '').trim();
}

function extractStateAbbr(geoName) {
  const match = geoName.match(/,\s*([A-Z]{2})(?:\s|$|\-|\/)/);
  if (match) return match[1];
  const match2 = geoName.match(/,\s*([A-Z]{2})-/);
  return match2 ? match2[1] : '';
}

function parseValue(val) {
  if (!val || val === '(NA)' || val === '(D)') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// Create tables
const schema = `
  CREATE TABLE msas (
    cbsa TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    state_abbr TEXT,
    rpp_all REAL,
    rpp_goods REAL,
    rpp_services REAL,
    rpp_rents REAL,
    year INTEGER,
    population INTEGER,
    median_income INTEGER
  );

  CREATE TABLE msa_history (
    cbsa TEXT NOT NULL,
    year INTEGER NOT NULL,
    rpp_all REAL,
    rpp_goods REAL,
    rpp_services REAL,
    rpp_rents REAL,
    PRIMARY KEY (cbsa, year)
  );

  CREATE TABLE states (
    abbr TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    rpp_all REAL,
    rpp_goods REAL,
    rpp_services REAL,
    rpp_rents REAL,
    year INTEGER,
    population INTEGER,
    median_income INTEGER,
    msa_count INTEGER DEFAULT 0
  );

  CREATE TABLE state_history (
    abbr TEXT NOT NULL,
    year INTEGER NOT NULL,
    rpp_all REAL,
    rpp_goods REAL,
    rpp_services REAL,
    rpp_rents REAL,
    PRIMARY KEY (abbr, year)
  );

  CREATE INDEX idx_msas_state ON msas(state_abbr);
  CREATE INDEX idx_msas_slug ON msas(slug);
  CREATE INDEX idx_msas_rpp ON msas(rpp_all DESC);
  CREATE INDEX idx_msa_history_cbsa ON msa_history(cbsa);
  CREATE INDEX idx_state_history_abbr ON state_history(abbr);
`;
db.exec(schema);

console.log('Tables created');

// Load raw data
const msaRaw = JSON.parse(readFileSync(`${RAW_DIR}/msa_rpp.json`, 'utf-8'));
const stateRaw = JSON.parse(readFileSync(`${RAW_DIR}/state_rpp.json`, 'utf-8'));

// Process MSA data
const msaMap = new Map();

for (const [category, records] of Object.entries(msaRaw)) {
  for (const r of records) {
    const cbsa = r.GeoFips;
    const year = parseInt(r.TimePeriod);
    const val = parseValue(r.DataValue);

    if (!msaMap.has(cbsa)) {
      msaMap.set(cbsa, {
        cbsa,
        name: cleanMsaName(r.GeoName),
        stateAbbr: extractStateAbbr(r.GeoName),
        years: new Map(),
      });
    }

    const entry = msaMap.get(cbsa);
    if (!entry.years.has(year)) {
      entry.years.set(year, { all: null, goods: null, services: null, rents: null });
    }
    entry.years.get(year)[category] = val;
  }
}

const insertMsa = db.prepare(`
  INSERT INTO msas (cbsa, name, slug, state_abbr, rpp_all, rpp_goods, rpp_services, rpp_rents, year, population, median_income)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMsaHist = db.prepare(`
  INSERT OR IGNORE INTO msa_history (cbsa, year, rpp_all, rpp_goods, rpp_services, rpp_rents)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const slugs = new Set();
const insertAllMsa = db.transaction(() => {
  for (const [cbsa, m] of msaMap) {
    const sortedYears = [...m.years.keys()].sort((a, b) => b - a);
    let latestYear = null;
    let latestData = null;
    for (const y of sortedYears) {
      const d = m.years.get(y);
      if (d.all !== null) {
        latestYear = y;
        latestData = d;
        break;
      }
    }
    if (!latestData) continue;

    let slug = slugify(m.name);
    if (slugs.has(slug)) slug = slugify(m.name + '-' + cbsa);
    slugs.add(slug);

    insertMsa.run(
      cbsa, m.name, slug, m.stateAbbr,
      latestData.all, latestData.goods, latestData.services, latestData.rents,
      latestYear, null, null
    );

    for (const [year, d] of m.years) {
      if (d.all !== null) {
        insertMsaHist.run(cbsa, year, d.all, d.goods, d.services, d.rents);
      }
    }
  }
});
insertAllMsa();

console.log('Inserted', msaMap.size, 'MSAs');

// Process State data
const stateMap = new Map();

for (const [category, records] of Object.entries(stateRaw)) {
  for (const r of records) {
    const fips = r.GeoFips;
    const abbr = FIPS_TO_ABBR[fips];
    if (!abbr) continue;

    const year = parseInt(r.TimePeriod);
    const val = parseValue(r.DataValue);

    if (!stateMap.has(abbr)) {
      stateMap.set(abbr, { abbr, years: new Map() });
    }

    const entry = stateMap.get(abbr);
    if (!entry.years.has(year)) {
      entry.years.set(year, { all: null, goods: null, services: null, rents: null });
    }
    entry.years.get(year)[category] = val;
  }
}

const msaCountsByState = {};
const msaCounts = db.prepare('SELECT state_abbr, COUNT(*) as cnt FROM msas WHERE state_abbr IS NOT NULL GROUP BY state_abbr').all();
for (const r of msaCounts) {
  msaCountsByState[r.state_abbr] = r.cnt;
}

const insertState = db.prepare(`
  INSERT INTO states (abbr, name, slug, rpp_all, rpp_goods, rpp_services, rpp_rents, year, population, median_income, msa_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertStateHist = db.prepare(`
  INSERT OR IGNORE INTO state_history (abbr, year, rpp_all, rpp_goods, rpp_services, rpp_rents)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertAllState = db.transaction(() => {
  for (const [abbr, s] of stateMap) {
    const sortedYears = [...s.years.keys()].sort((a, b) => b - a);
    let latestYear = null;
    let latestData = null;
    for (const y of sortedYears) {
      const d = s.years.get(y);
      if (d.all !== null) {
        latestYear = y;
        latestData = d;
        break;
      }
    }
    if (!latestData) continue;

    const name = STATE_NAMES[abbr] || abbr;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const msaCount = msaCountsByState[abbr] || 0;

    insertState.run(
      abbr, name, slug,
      latestData.all, latestData.goods, latestData.services, latestData.rents,
      latestYear, null, null, msaCount
    );

    for (const [year, d] of s.years) {
      if (d.all !== null) {
        insertStateHist.run(abbr, year, d.all, d.goods, d.services, d.rents);
      }
    }
  }
});
insertAllState();

console.log('Inserted', stateMap.size, 'states');

// Summary
const totalMsas = db.prepare('SELECT COUNT(*) as c FROM msas').get().c;
const totalMsaHist = db.prepare('SELECT COUNT(*) as c FROM msa_history').get().c;
const totalStates = db.prepare('SELECT COUNT(*) as c FROM states').get().c;
const totalStateHist = db.prepare('SELECT COUNT(*) as c FROM state_history').get().c;
const avgRpp = db.prepare('SELECT AVG(rpp_all) as v FROM msas').get().v;

console.log('\n=== Build Complete ===');
console.log('MSAs:', totalMsas);
console.log('MSA history rows:', totalMsaHist);
console.log('States:', totalStates);
console.log('State history rows:', totalStateHist);
console.log('Avg RPP (all items):', avgRpp?.toFixed(1));
console.log('Database:', DB_PATH);

db.close();
