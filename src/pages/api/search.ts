import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [], query: '' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = (locals as any).runtime.env.DB;
  const like = '%' + query.trim() + '%';
  const { results } = await db.prepare(`
    SELECT cbsa, name, slug, state_abbr, rpp_all, rpp_goods, rpp_services, rpp_rents
    FROM msas
    WHERE name LIKE ? OR cbsa = ?
    ORDER BY rpp_all DESC
    LIMIT ?
  `).bind(like, query.trim(), limit).all();

  return new Response(JSON.stringify({ results, query: query.trim() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
