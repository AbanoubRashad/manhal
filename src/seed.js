import { categories, courses } from './data/catalog.js';
import { lessonNotes } from './data/lessons.js';
import { slugify } from './services/studio.js';
import { sqlTime } from './lib/time.js';

export const DEMO_ACCOUNTS = [
  { role: 'learner', email: 'learner@manhal.test', password: 'manhal-learn', name: 'Mariam Lotfy' },
  { role: 'instructor', email: 'salma@manhal.test', password: 'manhal-teach', name: 'Salma Nour' },
  { role: 'admin', email: 'admin@manhal.test', password: 'manhal-admin', name: 'Manhal Admin' },
];

const BUYERS = ['Youssef Hamdy', 'Nada Ibrahim', 'Khaled Samy', 'Reem Mostafa', 'Ali Gamal', 'Habiba Tarek', 'Omar Fekry', 'Farida Adel'];

/** Sample Q&A, an announcement and a live session in Salma's Python course. */
function seedCommunity(s, { L, salma, course, daysAgo, now }) {
  const { db } = s;
  const py = course('python-for-data-analysis');
  const lesson = pos => db.get('SELECT id FROM lessons WHERE course_id = ? AND position = ?', py.id, pos).id;
  const buyer = db.get("SELECT u.id FROM users u JOIN enrollments e ON e.user_id = u.id AND e.course_id = ? WHERE u.id != ? AND u.role = 'learner' LIMIT 1", py.id, L.id) || L;
  const ask = (userId, pos, title, body, day) => db.run('INSERT INTO questions (course_id, lesson_id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    py.id, lesson(pos), userId, title, body, daysAgo(day, 15)).id;
  const answer = (qid, body, day) => {
    const { id } = db.run("INSERT INTO answers (question_id, author_id, kind, body, created_at, updated_at) VALUES (?, ?, 'instructor', ?, ?, ?)", qid, salma.id, body, daysAgo(day, 18), daysAgo(day, 18));
    s.knowledge.indexAnswer(id);
  };
  const q1 = ask(L.id, 4, 'Should I use dropna() or fillna() for missing prices?', 'About 3% of my rows have no price.', 9);
  answer(q1, "With only 3% missing, dropna() on the price column is usually fine. If those rows matter for other columns, fill the price with the product's median price instead, so one missing value doesn't throw away the whole order.", 8);
  const q2 = ask(buyer.id, 5, 'What is the difference between groupby().sum() and pivot_table()?', '', 20);
  answer(q2, 'groupby gives you one summary per group in a long list. pivot_table arranges the same kind of summary as a grid, with one dimension down the side and another across the top, which is easier to read when you compare two things like city and month.', 19);
  const q3 = ask(buyer.id, 6, 'How do I make the bars in my chart horizontal?', 'My category names overlap.', 1);
  db.run("INSERT INTO ai_drafts (question_id, body, citations_json, status) VALUES (?, ?, ?, 'draft')", q3,
    'Use plt.barh() instead of plt.bar(), or kind="barh" when plotting from pandas. Horizontal bars leave room for long category names, and sorting them makes the chart easier to read.',
    JSON.stringify([s.knowledge.lessonLabel(lesson(6)), s.knowledge.lessonLabel(lesson(7))].filter(Boolean)));

  const news = db.run('INSERT INTO announcements (course_id, title, body, created_at) VALUES (?, ?, ?, ?)', py.id, 'New practice dataset',
    'I added a cleaned version of the sales dataset to the "Analyzing sales data" lesson, so you can compare it with your own cleaning. See you at the live session!', daysAgo(2, 12)).id;
  const start = new Date(now()); start.setUTCDate(start.getUTCDate() + 2); start.setUTCHours(16, 0, 0, 0);
  db.run('INSERT INTO live_sessions (course_id, title, starts_at, minutes, link) VALUES (?, ?, ?, ?, ?)', py.id, 'Office hours: cleaning messy data',
    sqlTime(start), 60, 'https://meet.example.com/manhal-python-office-hours');

  const note = (kind, key, title, body, link, day) => db.run(`INSERT INTO notifications (user_id, kind, dedupe_key, title_en, title_ar, body_en, body_ar, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, L.id, kind, key, title.en, title.ar, body, body, link, daysAgo(day, 18));
  note('answer', `answer:${q1}:seed`, { en: 'Salma Nour answered your question', ar: 'سلمى نور ردّت على سؤالك' },
    'Should I use dropna() or fillna() for missing prices?', `/learn/${py.slug}/lesson/${lesson(4)}?tab=qa`, 8);
  note('news', `news:${news}`, { en: 'Python for Data Analysis: New practice dataset', ar: 'بايثون لتحليل البيانات: New practice dataset' },
    'I added a cleaned version of the sales dataset to the "Analyzing sales data" lesson.', `/learn/${py.slug}?tab=news`, 2);
}

/** Fill an empty database with the sample catalog and demo accounts. Returns false if data already exists. */
export function seed(s, { now = () => new Date() } = {}) {
  const { db, users } = s;
  if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) return false;
  const daysAgo = (d, h = 19) => { const t = new Date(now()); t.setUTCDate(t.getUTCDate() - d); t.setUTCHours(h, (d * 7) % 60, 0, 0); return sqlTime(t); };
  const realSend = s.mailer.send;
  s.mailer.send = async () => true; // no receipts for seeded history

  try {
    db.tx(() => {
      categories.forEach((c, i) => db.run('INSERT INTO categories (key, name_en, name_ar, glyph, hue, position) VALUES (?, ?, ?, ?, ?, ?)', c.key, c.en, c.ar, c.glyph, c.hue, i));

      const acct = {};
      for (const a of DEMO_ACCOUNTS) acct[a.role] = users.create({ ...a, verified: true, headline: a.role === 'instructor' ? 'Data scientist' : '' });

      const instructors = { 'Salma Nour': acct.instructor };
      courses.forEach((c, ci) => {
        let inst = instructors[c.instructor];
        if (!inst) {
          inst = instructors[c.instructor] = users.create({
            email: `${c.instructor.split(' ')[0].toLowerCase()}@manhal.test`, name: c.instructor, password: 'manhal-teach',
            role: 'instructor', headline: c.headline, verified: true,
          });
        }
        db.run('UPDATE users SET bio = ? WHERE id = ? AND bio = \'\'',
          `${c.headline} with years of hands-on experience, teaching practical skills on Manhal.`, inst.id);
        const { id } = db.run(`INSERT INTO courses (slug, instructor_id, category, level, title_en, title_ar, summary_en, summary_ar, price, rating, learners_base, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`, c.slug || slugify(c.title_en), inst.id, c.category, c.level, c.title_en, c.title_ar,
          c.summary_en, c.summary_ar, c.price, c.rating, c.learners, daysAgo(200 - ci * 9), daysAgo(30 - ci));
        let pos = 0;
        c.sections.forEach((line, si) => {
          const k = line.indexOf(': ');
          const sid = db.run('INSERT INTO sections (course_id, position, title_en) VALUES (?, ?, ?)', id, si, line.slice(0, k)).id;
          line.slice(k + 2).split(' / ').forEach(title => {
            db.run('INSERT INTO lessons (course_id, section_id, position, title_en, minutes, is_preview, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
              id, sid, pos, title, 9 + ((id * 7 + pos * 11) % 19), pos === 0 ? 1 : 0, lessonNotes[c.slug]?.[pos] || '');
            pos++;
          });
        });
        c.quiz.forEach(([prompt, options, answer], qi) => db.run('INSERT INTO quiz_questions (course_id, position, prompt, options_json, answer) VALUES (?, ?, ?, ?, ?)',
          id, qi, prompt, JSON.stringify(options), answer));
      });

      db.run("INSERT INTO coupons (code, percent) VALUES ('MANHAL20', 20)");
      db.run("INSERT INTO coupons (code, percent, max_uses) VALUES ('LAUNCH50', 50, 100)");

      const course = slug => db.get('SELECT * FROM courses WHERE slug = ?', slug);
      /** A paid order in the past, fulfilled through the real order logic. */
      const buy = (user, slugs, day, coupon = null) => {
        const items = slugs.map(course);
        const sub = items.reduce((a, c) => a + c.price, 0);
        const discount = coupon ? Math.round(sub * 0.2) : 0;
        const { id } = db.run(`INSERT INTO orders (user_id, status, subtotal, discount, total, coupon_code, provider, created_at, updated_at)
          VALUES (?, 'pending', ?, ?, ?, ?, 'demo', ?, ?)`, user.id, sub, discount, sub - discount, coupon, daysAgo(day), daysAgo(day));
        let left = discount;
        items.forEach((c, i) => {
          const d = i === items.length - 1 ? left : Math.round(discount * c.price / sub);
          left -= d;
          db.run('INSERT INTO order_items (order_id, course_id, instructor_id, price, paid) VALUES (?, ?, ?, ?, ?)', id, c.id, c.instructor_id, c.price, c.price - d);
        });
        s.orders.fulfill(id);
        db.run('UPDATE orders SET paid_at = ?, created_at = ? WHERE id = ?', daysAgo(day), daysAgo(day), id);
        db.run('UPDATE earnings SET created_at = ? WHERE order_id = ?', daysAgo(day), id);
        db.run('UPDATE enrollments SET created_at = ? WHERE order_id = ?', daysAgo(day), id);
        return id;
      };

      // The demo learner: two paid courses and one free one, at different stages.
      const L = acct.learner;
      buy(L, ['python-for-data-analysis', 'ui-ux-design-from-sketch-to-prototype'], 40, 'MANHAL20');
      const mkt = course('digital-marketing-essentials');
      db.run("INSERT INTO enrollments (user_id, course_id, source, created_at) VALUES (?, ?, 'free', ?)", L.id, mkt.id, daysAgo(60));
      const progress = [['python-for-data-analysis', 5], ['ui-ux-design-from-sketch-to-prototype', 9], ['digital-marketing-essentials', 12]];
      let n = 0;
      for (const [slug, count] of progress) {
        const c = course(slug);
        const ls = db.all('SELECT id FROM lessons WHERE course_id = ? ORDER BY position LIMIT ?', c.id, count);
        for (const l of ls) {
          // Recent days are consecutive (a streak); older ones are spread out.
          const day = n < 6 ? n : 6 + Math.floor((n - 6) * 2.6);
          db.run('INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', L.id, l.id, daysAgo(day, 17 + (n % 4)));
          n++;
        }
        db.run('UPDATE enrollments SET last_lesson_id = ? WHERE user_id = ? AND course_id = ?', ls[ls.length - 1].id, L.id, c.id);
      }
      db.run('UPDATE enrollments SET quiz_passed = 1 WHERE user_id = ? AND course_id = ?', L.id, mkt.id);
      db.run("INSERT INTO quiz_attempts (user_id, course_id, score, total, passed, created_at) VALUES (?, ?, 3, 3, 1, ?)", L.id, mkt.id, daysAgo(8));
      db.run('INSERT INTO certificates (code, user_id, course_id, name, issued_at) VALUES (?, ?, ?, ?, ?)', 'MNL-DM24-7Q4K2P', L.id, mkt.id, L.name, daysAgo(8));
      for (const slug of ['machine-learning-foundations', 'react-and-next-js-in-practice']) {
        db.run('INSERT INTO wishlist (user_id, course_id) VALUES (?, ?)', L.id, course(slug).id);
      }

      // Other learners buying across the catalog, spread over five months.
      const paidSlugs = courses.filter(c => c.price > 0).map(c => c.slug);
      BUYERS.forEach((name, i) => {
        const u = users.create({ email: `${name.split(' ')[0].toLowerCase()}@example.com`, name, password: 'manhal-learn', verified: true });
        const picks = [paidSlugs[i % paidSlugs.length], paidSlugs[(i * 3 + 1) % paidSlugs.length], 'sql-for-analysts'];
        buy(u, [...new Set(picks.slice(0, 2))], 140 - i * 15, i % 3 === 0 ? 'MANHAL20' : null);
        if (i % 2 === 0 && !db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', u.id, course('sql-for-analysts').id)) {
          buy(u, ['sql-for-analysts'], 100 - i * 11);
        }
      });

      // Salma has been paid once and has a balance to request.
      db.run(`INSERT INTO payouts (instructor_id, amount, method, details, status, requested_at, decided_at)
        VALUES (?, 1000, 'instapay', 'salma@instapay', 'paid', ?, ?)`, acct.instructor.id, daysAgo(50), daysAgo(48));
      db.run("INSERT INTO applications (name, email, topic, created_at) VALUES ('Hossam Fathy', 'hossam@example.com', 'Development', ?)", daysAgo(3));

      // Nour's knowledge index for every course that has lesson notes, then sample community activity.
      for (const slug of Object.keys(lessonNotes)) s.knowledge.reindexCourse(course(slug).id);
      seedCommunity(s, { L, salma: acct.instructor, course, daysAgo, now });
    });
  } finally {
    s.mailer.send = realSend;
  }
  return true;
}
