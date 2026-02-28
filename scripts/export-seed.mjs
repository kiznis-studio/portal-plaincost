import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const DB_PATH = '/storage/plaincost/plaincost.db';
const SEED_DIR = '/storage/plaincost/seed';
const CHUNK_SIZE = 500;

if (!existsSync(DB_PATH)) {
  console.error('Database not found: ' + DB_PATH);
  process.exit(1);
}

if (existsSync(SEED_DIR)) {
  console.log('Removing existing seed directory...');
  rmSync(SEED_DIR, { recursive: true });
}
mkdirSync(SEED_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function exportTable(tableName, columns) {
  console.log('Exporting ' + tableName + '...');
  const rows = db.prepare('SELECT * FROM ' + tableName).all();
  let fileIndex = 0;
  let fileCount = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const values = chunk.map(row => {
      const vals = columns.map(col => escapeSql(row[col]));
      return '(' + vals.join(',') + ')';
    });

    const sql = 'INSERT OR IGNORE INTO ' + tableName + ' (' + columns.join(',') + ') VALUES\n' + values.join(',\n') + ';\n';
    const fileName = tableName + '_' + String(fileIndex).padStart(5, '0') + '.sql';
    writeFileSync(join(SEED_DIR, fileName), sql);
    fileIndex++;
    fileCount += chunk.length;
  }

  console.log('  ' + fileCount.toLocaleString() + ' rows -> ' + fileIndex + ' files');
  return fileIndex;
}

// Export schema
const schema = `
CREATE TABLE IF NOT EXISTS msas (
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

CREATE TABLE IF NOT EXISTS msa_history (
  cbsa TEXT NOT NULL,
  year INTEGER NOT NULL,
  rpp_all REAL,
  rpp_goods REAL,
  rpp_services REAL,
  rpp_rents REAL,
  PRIMARY KEY (cbsa, year)
);

CREATE TABLE IF NOT EXISTS states (
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

CREATE TABLE IF NOT EXISTS state_history (
  abbr TEXT NOT NULL,
  year INTEGER NOT NULL,
  rpp_all REAL,
  rpp_goods REAL,
  rpp_services REAL,
  rpp_rents REAL,
  PRIMARY KEY (abbr, year)
);

CREATE INDEX IF NOT EXISTS idx_msas_state ON msas(state_abbr);
CREATE INDEX IF NOT EXISTS idx_msas_slug ON msas(slug);
CREATE INDEX IF NOT EXISTS idx_msas_rpp ON msas(rpp_all DESC);
CREATE INDEX IF NOT EXISTS idx_msa_history_cbsa ON msa_history(cbsa);
CREATE INDEX IF NOT EXISTS idx_state_history_abbr ON state_history(abbr);

CREATE TABLE IF NOT EXISTS _stats (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

writeFileSync(join(SEED_DIR, '00_schema.sql'), schema);
console.log('Schema exported');

let totalFiles = 1;

totalFiles += exportTable('states', ['abbr', 'name', 'slug', 'rpp_all', 'rpp_goods', 'rpp_services', 'rpp_rents', 'year', 'population', 'median_income', 'msa_count']);
totalFiles += exportTable('msas', ['cbsa', 'name', 'slug', 'state_abbr', 'rpp_all', 'rpp_goods', 'rpp_services', 'rpp_rents', 'year', 'population', 'median_income']);
totalFiles += exportTable('msa_history', ['cbsa', 'year', 'rpp_all', 'rpp_goods', 'rpp_services', 'rpp_rents']);
totalFiles += exportTable('state_history', ['abbr', 'year', 'rpp_all', 'rpp_goods', 'rpp_services', 'rpp_rents']);
totalFiles += exportTable('_stats', ['key', 'value']);

console.log('\n=== Export Complete ===');
console.log('Total files: ' + totalFiles);
console.log('Seed directory: ' + SEED_DIR);

db.close();
