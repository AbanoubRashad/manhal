// Server-rendered <head> tags, sitemap.xml and robots.txt.
// Shared by the Node server (per request) and the demo build (pre-rendered pages).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SITE = {
  title: 'Manhal: online courses in English and Arabic',
  description: 'Practical courses taught by people who do the work every day. Learn at your own pace, practice on real projects, and earn a certificate.',
};

const STATIC = {
  '/': SITE,
  '/explore': { title: 'Explore courses · Manhal', description: 'Browse courses in development, data, design, business, marketing, languages and more, in English and Arabic.' },
  '/teach': { title: 'Teach on Manhal', description: 'Create a course, reach learners across Egypt and the Arab world, and earn from every enrollment.' },
  '/terms': { title: 'Terms of service · Manhal', description: 'The terms that apply when you use Manhal.' },
  '/privacy': { title: 'Privacy policy · Manhal', description: 'What data Manhal collects and how it is used.' },
  '/refunds': { title: 'Refund policy · Manhal', description: 'When and how you can get a refund for a Manhal course.' },
};

/** Paths that should not be indexed. */
export const PRIVATE_PREFIXES = ['/api/', '/learn/', '/learning', '/cart', '/orders', '/account', '/studio', '/admin', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/certificates', '/dev/', '/notifications', '/n/', '/mentor/', '/parent/'];

/** Work out the meta tags for a path. `findCourse(slug)` returns a published course row or null. */
export function metaFor(path, { baseUrl, findCourse }) {
  const url = baseUrl + (path === '/' ? '/' : path.replace(/\/$/, ''));
  const base = { url, image: `${baseUrl}/og.png`, type: 'website', robots: 'index,follow' };
  const m = /^\/courses\/([a-z0-9-]+)\/?$/.exec(path);
  if (m) {
    const c = findCourse(m[1]);
    if (c) {
      return {
        ...base, type: 'article',
        title: `${c.title_en} · Manhal`,
        description: c.summary_en || SITE.description,
        jsonLd: {
          '@context': 'https://schema.org', '@type': 'Course', name: c.title_en, description: c.summary_en,
          inLanguage: ['en', 'ar'], url,
          provider: { '@type': 'Organization', name: 'Manhal', sameAs: baseUrl },
          offers: { '@type': 'Offer', price: c.price, priceCurrency: 'EGP', category: c.price ? 'Paid' : 'Free' },
          ...(c.instructor_name ? { instructor: { '@type': 'Person', name: c.instructor_name } } : {}),
        },
      };
    }
    return { ...base, ...SITE, robots: 'noindex', status: 404 };
  }
  const page = STATIC[path.replace(/\/$/, '') || '/'];
  if (page) return { ...base, ...page };
  const priv = PRIVATE_PREFIXES.some(p => path.startsWith(p));
  return { ...base, ...SITE, robots: 'noindex', status: priv ? 200 : 404 };
}

/** Inject meta tags into the SPA shell (replaces <title> and the <!--meta--> marker). */
export function renderShell(html, meta) {
  const tags = [
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="robots" content="${meta.robots}">`,
    `<link rel="canonical" href="${esc(meta.url)}">`,
    `<meta property="og:site_name" content="Manhal">`,
    `<meta property="og:type" content="${meta.type}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(meta.url)}">`,
    `<meta property="og:image" content="${esc(meta.image)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta property="og:locale" content="en_US"><meta property="og:locale:alternate" content="ar_EG">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n');
  return html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`).replace('<!--meta-->', tags);
}

export function sitemapXml(baseUrl, courses) {
  const urls = [
    ...['/', '/explore', '/teach', '/terms', '/privacy', '/refunds'].map(p => ({ loc: baseUrl + p, lastmod: null })),
    ...courses.map(c => ({ loc: `${baseUrl}/courses/${c.slug}`, lastmod: (c.updated_at || '').slice(0, 10) || null })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u =>
    `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

export function robotsTxt(baseUrl) {
  return `User-agent: *\nAllow: /\n${PRIVATE_PREFIXES.map(p => `Disallow: ${p}`).join('\n')}\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}
