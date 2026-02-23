import { writeFileSync, mkdirSync, existsSync } from 'fs';

const API_KEY = process.env.BEA_API_KEY || 'B468E562-A7ED-4F67-9636-90E14A4C7E5E';
const RAW_DIR = '/storage/plaincost/raw';
const BASE = 'https://apps.bea.gov/api/data/';

mkdirSync(RAW_DIR, { recursive: true });

// LineCode mapping for RPP:
// 1 = RPP: All items
// 2 = RPP: Goods
// 3 = RPP: Services: Housing (Rents)
// 4 = RPP: Services: Other

const LINE_CODES = { 1: 'all', 2: 'goods', 3: 'rents', 4: 'services' };

async function fetchBea(params) {
  const url = new URL(BASE);
  url.searchParams.set('UserID', API_KEY);
  url.searchParams.set('method', 'GetData');
  url.searchParams.set('DataSetName', 'Regional');
  url.searchParams.set('ResultFormat', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  console.log('  Fetching:', url.searchParams.get('TableName'), 'LineCode', url.searchParams.get('LineCode'), url.searchParams.get('GeoFips'));
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const json = await resp.json();

  if (json.BEAAPI?.Results?.Error) {
    console.error('  BEA API Error:', JSON.stringify(json.BEAAPI.Results.Error));
    return [];
  }

  const data = json.BEAAPI?.Results?.Data || [];
  console.log('  Got', data.length, 'records');
  return data;
}

async function main() {
  console.log('=== Fetching BEA Regional Price Parities ===\n');

  // Fetch MSA-level RPP for all years and all line codes
  console.log('--- MSA RPP ---');
  const msaData = {};
  for (const [code, label] of Object.entries(LINE_CODES)) {
    const data = await fetchBea({
      TableName: 'MARPP',
      LineCode: code,
      GeoFips: 'MSA',
      Year: 'ALL',
    });
    msaData[label] = data;
    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  writeFileSync(`${RAW_DIR}/msa_rpp.json`, JSON.stringify(msaData, null, 2));
  console.log('Saved msa_rpp.json\n');

  // Fetch State-level RPP for all years and all line codes
  console.log('--- State RPP ---');
  const stateData = {};
  for (const [code, label] of Object.entries(LINE_CODES)) {
    const data = await fetchBea({
      TableName: 'SARPP',
      LineCode: code,
      GeoFips: 'STATE',
      Year: 'ALL',
    });
    stateData[label] = data;
    await new Promise(r => setTimeout(r, 1000));
  }

  writeFileSync(`${RAW_DIR}/state_rpp.json`, JSON.stringify(stateData, null, 2));
  console.log('Saved state_rpp.json\n');

  // Summary
  const msaYears = new Set();
  const msaGeos = new Set();
  for (const records of Object.values(msaData)) {
    for (const r of records) {
      msaYears.add(r.TimePeriod);
      msaGeos.add(r.GeoFips);
    }
  }

  const stateYears = new Set();
  const stateGeos = new Set();
  for (const records of Object.values(stateData)) {
    for (const r of records) {
      stateYears.add(r.TimePeriod);
      stateGeos.add(r.GeoFips);
    }
  }

  console.log('=== Summary ===');
  console.log('MSAs:', msaGeos.size, '| Years:', [...msaYears].sort().join(', '));
  console.log('States:', stateGeos.size, '| Years:', [...stateYears].sort().join(', '));
}

main().catch(err => { console.error(err); process.exit(1); });
