import { validate, id } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';

export default function catalogRoutes(r, s) {
  const { db, catalog, learning, limits } = s;

  r.get('/api/home', ctx => ({
    stats: catalog.stats(),
    categories: catalog.categories(),
    courses: catalog.list({ sort: 'pop' }, ctx.user?.id),
  }));

  r.get('/api/categories', () => ({ categories: catalog.categories() }));

  r.get('/api/courses', ctx => {
    const q = validate(ctx.query, {
      q: { type: 'string', label: 'Search', max: 100, default: '' },
      cat: { type: 'string', label: 'Category', max: 20, default: 'all' },
      level: { type: 'string', label: 'Level', oneOf: ['all', 'beg', 'int', 'adv'], default: 'all' },
      price: { type: 'string', label: 'Price', oneOf: ['all', 'free', 'paid'], default: 'all' },
      sort: { type: 'string', label: 'Sort', oneOf: ['pop', 'rate', 'low', 'high', 'new'], default: 'pop' },
    });
    return { courses: catalog.list(q, ctx.user?.id) };
  });

  r.get('/api/courses/:slug', ctx => ({ course: catalog.detail(ctx.params.slug, ctx.user) }));

  r.post('/api/courses/:id/enroll', ctx => learning.enrollFree(ctx.user, id(ctx.params.id, 'course')), { auth: 'user' });

  r.get('/api/wishlist', ctx => {
    const ids = db.all('SELECT course_id FROM wishlist WHERE user_id = ?', ctx.user.id).map(r => r.course_id);
    return { courses: catalog.list({ ids }, ctx.user.id) };
  }, { auth: 'user' });
  r.post('/api/wishlist/:id', ctx => {
    const cid = id(ctx.params.id, 'course');
    if (!catalog.row(cid)) throw notFound("We couldn't find that course.");
    db.run('INSERT OR IGNORE INTO wishlist (user_id, course_id) VALUES (?, ?)', ctx.user.id, cid);
    return { wished: true };
  }, { auth: 'user' });
  r.delete('/api/wishlist/:id', ctx => {
    db.run('DELETE FROM wishlist WHERE user_id = ? AND course_id = ?', ctx.user.id, id(ctx.params.id, 'course'));
    return { wished: false };
  }, { auth: 'user' });

  // "Apply to teach" form on the Teach page.
  r.post('/api/applications', ctx => {
    limits.email.hit(`apply:${ctx.ip}`);
    const body = validate(ctx.body, {
      name: { type: 'string', label: 'Full name', required: true, min: 2, max: 80 },
      email: { type: 'string', label: 'Email', required: true, email: true, max: 200 },
      topic: { type: 'string', label: 'Topic', required: true, max: 80 },
    });
    db.run('INSERT INTO applications (name, email, topic, user_id) VALUES (?, ?, ?, ?)', body.name, body.email, body.topic, ctx.user?.id ?? null);
    return { status: 201, body: { received: true } };
  });

  r.get('/api/certificates/:code', ctx => {
    if (!/^MNL-[A-Z0-9]{4}-[A-Z0-9]{6}$/i.test(ctx.params.code)) throw notFound("We couldn't find a certificate with that ID. Check it and try again.");
    return { certificate: learning.verify(ctx.params.code) };
  });
}
