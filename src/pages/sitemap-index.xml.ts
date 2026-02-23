import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const base = 'https://plaincost.com';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-states.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-metros.xml</loc></sitemap>
</sitemapindex>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
