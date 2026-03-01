import type { APIRoute } from 'astro';
import { getTopMsasByPopulation, getAllMsas } from '../lib/db';

const BASE = 'https://plaincost.com';

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).runtime.env.DB;
  const topMetros = await getTopMsasByPopulation(db, 50);
  const allMsas = await getAllMsas(db);

  const slugSet = new Set(allMsas.map(m => m.slug));
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const from of topMetros) {
    for (const to of allMsas) {
      if (from.slug === to.slug) continue;
      const key = [from.slug, to.slug].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(`${BASE}/compare/${from.slug}/${to.slug}`);
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(url => `  <url><loc>${url}</loc><changefreq>monthly</changefreq></url>`),
    '</urlset>',
  ].join('\n');

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
