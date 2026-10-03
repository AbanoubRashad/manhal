// Build the static, browser-only demo into dist/ (deployed to Firebase Hosting).
// The front end is unchanged; API calls are answered in the browser by the real
// server code from src/, running on SQLite-in-WebAssembly (see demo/boot.js).
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courses } from '../src/data/catalog.js';
import { metaFor, renderShell, sitemapXml, robotsTxt } from '../src/lib/seo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const BASE = (process.env.DEMO_URL || 'https://manhal-learning.web.app').replace(/\/$/, '');
const SQLJS = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js';
// Server modules that only make sense in Node are left out; crypto is swapped for a browser version.
const SKIP = new Set(['server.js', 'config.js', 'db.js']);

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, 'public'), OUT, { recursive: true });
cpSync(join(ROOT, 'src'), join(OUT, 'server'), { recursive: true, filter: src => !SKIP.has(src.replace(/\\/g, '/').split('/src/').pop()) });
cpSync(join(ROOT, 'demo', 'crypto.js'), join(OUT, 'server', 'lib', 'crypto.js'));
mkdirSync(join(OUT, 'demo'), { recursive: true });
for (const f of ['boot.js', 'db.js']) cpSync(join(ROOT, 'demo', f), join(OUT, 'demo', f));

const shell = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8').replace(
  '<script type="module" src="/js/app.js"></script>',
  `<script src="${SQLJS}" crossorigin="anonymous"></script>\n<script type="module" src="/demo/boot.js"></script>\n<script type="module" src="/js/app.js"></script>`);

const bySlug = Object.fromEntries(courses.map(c => [c.slug, { ...c, instructor_name: c.instructor }]));
const page = path => {
  const meta = metaFor(path, { baseUrl: BASE, findCourse: slug => bySlug[slug] || null });
  const file = path === '/' ? join(OUT, 'index.html') : join(OUT, ...path.split('/').filter(Boolean), 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderShell(shell, meta));
};
['/', '/explore', '/teach', '/terms', '/privacy', '/refunds'].forEach(page);
courses.forEach(c => page(`/courses/${c.slug}`));
// Fallback shell for every other route (Firebase rewrites to it).
writeFileSync(join(OUT, 'app.html'), renderShell(shell, metaFor('/learning', { baseUrl: BASE, findCourse: () => null })));

writeFileSync(join(OUT, 'sitemap.xml'), sitemapXml(BASE, courses.map(c => ({ slug: c.slug }))));
writeFileSync(join(OUT, 'robots.txt'), robotsTxt(BASE));
if (!existsSync(join(OUT, 'og.png'))) console.warn('warning: public/og.png is missing');
console.log(`Demo built in dist/ for ${BASE} (${courses.length} course pages pre-rendered).`);
