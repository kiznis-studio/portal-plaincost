import type { APIRoute } from 'astro';
import { getMsaBySlug, formatRpp } from '../../lib/db';
import { renderOgImage } from '../../lib/og';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = (params.slug || '').replace(/\.png$/, '');
  if (!slug) return new Response('Not found', { status: 404 });

  const db = (locals as any).runtime.env.DB;
  const msa = await getMsaBySlug(db, slug);
  if (!msa) return new Response('Not found', { status: 404 });

  const overallDiff = msa.rpp_all - 100;
  const diffLabel = overallDiff > 0 ? `${overallDiff.toFixed(1)}% above avg` : overallDiff < 0 ? `${Math.abs(overallDiff).toFixed(1)}% below avg` : 'At national avg';
  const salaryEquiv = Math.round(100000 * (msa.rpp_all / 100));

  const nameSize = msa.name.length > 45 ? 32 : msa.name.length > 30 ? 38 : 44;

  const rppBar = (label: string, value: number) => ({
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: '12px' },
      children: [
        { type: 'span', props: { style: { fontSize: '16px', color: '#94a3b8', width: '80px', textAlign: 'right' as const }, children: label } },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flex: 1, height: '24px', borderRadius: '4px', overflow: 'hidden', background: '#1e293b' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: `${Math.min(value / 1.5, 100)}%`,
                    height: '100%',
                    borderRadius: '4px',
                    background: value > 100 ? '#f59e0b' : '#10b981',
                  },
                },
              },
            ],
          },
        },
        { type: 'span', props: { style: { fontSize: '18px', fontWeight: 700, color: value > 100 ? '#f59e0b' : '#10b981', width: '60px' }, children: formatRpp(value) } },
      ],
    },
  });

  const element = {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        padding: '50px 60px',
        fontFamily: 'Inter',
        color: '#ffffff',
      },
      children: [
        // Header
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { width: '32px', height: '32px', borderRadius: '6px', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, marginRight: '10px' },
                        children: 'P',
                      },
                    },
                    { type: 'span', props: { style: { fontSize: '22px', fontWeight: 700, color: '#10b981' }, children: 'PlainCost' } },
                  ],
                },
              },
              { type: 'span', props: { style: { fontSize: '16px', color: '#64748b' }, children: 'Cost of Living Data' } },
            ],
          },
        },
        // Metro name
        {
          type: 'div',
          props: {
            style: { fontSize: `${nameSize}px`, fontWeight: 700, lineHeight: 1.2, marginBottom: '8px', maxWidth: '1000px' },
            children: msa.name,
          },
        },
        // Overall RPP + salary equiv
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'baseline', gap: '24px', marginBottom: '28px' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'baseline', gap: '8px' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '64px', fontWeight: 700, color: msa.rpp_all >= 100 ? '#f59e0b' : '#10b981' }, children: formatRpp(msa.rpp_all) } },
                    { type: 'span', props: { style: { fontSize: '22px', color: '#94a3b8' }, children: diffLabel } },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', borderLeft: '2px solid #334155', paddingLeft: '24px' },
                  children: [
                    { type: 'span', props: { style: { fontSize: '16px', color: '#94a3b8' }, children: '$100K nationally =' } },
                    { type: 'span', props: { style: { fontSize: '32px', fontWeight: 700, color: '#ffffff' }, children: `$${salaryEquiv.toLocaleString('en-US')}` } },
                  ],
                },
              },
            ],
          },
        },
        // RPP bars
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 },
            children: [
              rppBar('Overall', msa.rpp_all),
              rppBar('Goods', msa.rpp_goods),
              rppBar('Services', msa.rpp_services),
              rppBar('Rents', msa.rpp_rents),
            ],
          },
        },
        // Footer
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '14px', color: '#475569' },
            children: [
              { type: 'span', props: { children: `Source: BEA Regional Price Parities (${msa.year})` } },
              { type: 'span', props: { children: 'plainCost.com' } },
            ],
          },
        },
      ],
    },
  };

  return renderOgImage(element);
};
