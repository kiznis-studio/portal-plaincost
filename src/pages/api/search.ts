import type { APIRoute } from 'astro';

const CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
};

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const trimmed = query.trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '15'), 15);

  if (trimmed.length < 2) {
    return new Response(JSON.stringify({ results: [], query: '' }), {
      headers: CACHE_HEADERS,
    });
  }

  const db = (locals as any).runtime.env.DB;
  const prefix = trimmed + '%';
  const { results } = await db.prepare(`
    SELECT cbsa, name, slug, state_abbr, rpp_all, rpp_goods, rpp_services, rpp_rents
    FROM msas
    WHERE name LIKE ? OR cbsa = ?
    ORDER BY rpp_all DESC
    LIMIT ?
  `).bind(prefix, trimmed, limit).all();

  return new Response(JSON.stringify({ results, query: trimmed }), {
    headers: CACHE_HEADERS,
  });
};
