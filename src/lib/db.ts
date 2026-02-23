// PlainCost D1 query library
// All functions accept D1Database as first param — NEVER at module scope

// --- Interfaces ---

export interface Msa {
  cbsa: string;
  name: string;
  slug: string;
  state_abbr: string;
  rpp_all: number;
  rpp_goods: number;
  rpp_services: number;
  rpp_rents: number;
  year: number;
  population: number | null;
  median_income: number | null;
}

export interface MsaHistory {
  cbsa: string;
  year: number;
  rpp_all: number;
  rpp_goods: number;
  rpp_services: number;
  rpp_rents: number;
}

export interface StateInfo {
  abbr: string;
  name: string;
  slug: string;
  rpp_all: number;
  rpp_goods: number;
  rpp_services: number;
  rpp_rents: number;
  year: number;
  population: number | null;
  median_income: number | null;
  msa_count: number;
}

export interface StateHistory {
  abbr: string;
  year: number;
  rpp_all: number;
  rpp_goods: number;
  rpp_services: number;
  rpp_rents: number;
}

// --- Helpers ---

export function formatRpp(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(1);
}

export function rppDiff(value: number | null): string {
  if (value === null || value === undefined) return '';
  const diff = value - 100;
  if (diff === 0) return 'at national average';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}% vs national avg`;
}

export function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString();
}

export function formatMoney(amount: number | null): string {
  if (amount === null || amount === undefined) return 'N/A';
  return '$' + Math.round(amount).toLocaleString();
}

export function salaryEquivalent(salary: number, fromRpp: number, toRpp: number): number {
  return Math.round(salary * (toRpp / fromRpp));
}

// --- MSAs ---

export async function getMsaBySlug(db: D1Database, slug: string): Promise<Msa | null> {
  return db.prepare('SELECT * FROM msas WHERE slug = ?').bind(slug).first<Msa>();
}

export async function getAllMsas(db: D1Database): Promise<Msa[]> {
  const { results } = await db.prepare('SELECT * FROM msas ORDER BY name COLLATE NOCASE').all<Msa>();
  return results;
}

export async function getMsasByState(db: D1Database, stateAbbr: string): Promise<Msa[]> {
  const { results } = await db.prepare(
    'SELECT * FROM msas WHERE state_abbr = ? ORDER BY name COLLATE NOCASE'
  ).bind(stateAbbr).all<Msa>();
  return results;
}

export async function getMsaHistory(db: D1Database, cbsa: string): Promise<MsaHistory[]> {
  const { results } = await db.prepare(
    'SELECT * FROM msa_history WHERE cbsa = ? ORDER BY year'
  ).bind(cbsa).all<MsaHistory>();
  return results;
}

// --- States ---

export async function getAllStates(db: D1Database): Promise<StateInfo[]> {
  const { results } = await db.prepare('SELECT * FROM states ORDER BY name COLLATE NOCASE').all<StateInfo>();
  return results;
}

export async function getStateBySlug(db: D1Database, slug: string): Promise<StateInfo | null> {
  return db.prepare('SELECT * FROM states WHERE slug = ?').bind(slug).first<StateInfo>();
}

export async function getStateHistory(db: D1Database, abbr: string): Promise<StateHistory[]> {
  const { results } = await db.prepare(
    'SELECT * FROM state_history WHERE abbr = ? ORDER BY year'
  ).bind(abbr).all<StateHistory>();
  return results;
}

// --- Rankings ---

export async function getMostExpensiveMsas(db: D1Database, limit = 25): Promise<Msa[]> {
  const { results } = await db.prepare(
    'SELECT * FROM msas ORDER BY rpp_all DESC LIMIT ?'
  ).bind(limit).all<Msa>();
  return results;
}

export async function getLeastExpensiveMsas(db: D1Database, limit = 25): Promise<Msa[]> {
  const { results } = await db.prepare(
    'SELECT * FROM msas ORDER BY rpp_all ASC LIMIT ?'
  ).bind(limit).all<Msa>();
  return results;
}

export async function getHighestRentMsas(db: D1Database, limit = 25): Promise<Msa[]> {
  const { results } = await db.prepare(
    'SELECT * FROM msas ORDER BY rpp_rents DESC LIMIT ?'
  ).bind(limit).all<Msa>();
  return results;
}

// --- Search ---

export async function searchMsas(db: D1Database, query: string, limit = 20): Promise<Msa[]> {
  const like = '%' + query.trim() + '%';
  const { results } = await db.prepare(`
    SELECT * FROM msas
    WHERE name LIKE ? OR cbsa = ?
    ORDER BY population DESC
    LIMIT ?
  `).bind(like, query.trim(), limit).all<Msa>();
  return results;
}

// --- Stats ---

export async function getNationalStats(db: D1Database) {
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM msas) as msa_count,
      (SELECT COUNT(*) FROM states) as state_count,
      (SELECT MAX(rpp_all) FROM msas) as max_rpp_all,
      (SELECT MIN(rpp_all) FROM msas) as min_rpp_all,
      (SELECT AVG(rpp_all) FROM msas) as avg_rpp_all,
      (SELECT MAX(rpp_rents) FROM msas) as max_rpp_rents,
      (SELECT MIN(rpp_rents) FROM msas) as min_rpp_rents
  `).first<{
    msa_count: number;
    state_count: number;
    max_rpp_all: number;
    min_rpp_all: number;
    avg_rpp_all: number;
    max_rpp_rents: number;
    min_rpp_rents: number;
  }>();
}
