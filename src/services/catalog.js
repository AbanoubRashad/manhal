import { notFound } from '../lib/errors.js';

const SORTS = {
  pop: (a, b) => b.learners - a.learners,
  rate: (a, b) => b.rating - a.rating || b.learners - a.learners,
  low: (a, b) => a.price - b.price,
  high: (a, b) => b.price - a.price,
  new: (a, b) => b.id - a.id,
};

export function catalogService({ db }) {
  const cats = () => db.all('SELECT * FROM categories ORDER BY position');
  let catMap = null;
  const catByKey = k => { catMap ??= Object.fromEntries(cats().map(c => [c.key, c])); return catMap[k]; };

  /** Shape a course row (joined with instructor + counts) for the client. */
  function card(r) {
    const cat = catByKey(r.category);
    return {
      id: r.id, slug: r.slug, category: r.category, level: r.level, status: r.status,
      title: { en: r.title_en, ar: r.title_ar || r.title_en },
      summary: { en: r.summary_en, ar: r.summary_ar || r.summary_en },
      price: r.price, rating: r.rating,
      learners: r.learners_base + (r.enrolled || 0),
      minutes: r.minutes || 0, lessons: r.lesson_count || 0,
      hue: (cat?.hue ?? 200) + (r.id % 3) * 10, glyph: cat?.glyph ?? '•',
      instructor: { id: r.instructor_id, name: r.instructor_name, headline: r.instructor_headline },
      updatedAt: r.updated_at,
    };
  }

  const BASE = `SELECT c.*, u.name AS instructor_name, u.headline AS instructor_headline,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled,
      (SELECT COALESCE(SUM(minutes),0) FROM lessons l WHERE l.course_id = c.id) AS minutes,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
    FROM courses c JOIN users u ON u.id = c.instructor_id`;

  function progressFor(userId, courseId) {
    const r = db.get(`SELECT
        (SELECT COUNT(*) FROM lessons WHERE course_id = ?) AS total,
        (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = ? AND l.course_id = ?) AS done,
        e.quiz_passed AS quiz
      FROM enrollments e WHERE e.user_id = ? AND e.course_id = ?`, courseId, userId, courseId, userId, courseId);
    if (!r) return null;
    return { done: r.done, total: r.total, quizPassed: Boolean(r.quiz), percent: Math.round((r.done + (r.quiz ? 1 : 0)) / (r.total + 1) * 100) };
  }

  /** Viewer-specific flags for a list of course ids. */
  function viewerState(userId) {
    if (!userId) return { enrolled: new Set(), cart: new Set(), wish: new Set() };
    const ids = sql => new Set(db.all(sql, userId).map(r => r.course_id));
    return {
      enrolled: ids('SELECT course_id FROM enrollments WHERE user_id = ?'),
      cart: ids('SELECT course_id FROM cart_items WHERE user_id = ?'),
      wish: ids('SELECT course_id FROM wishlist WHERE user_id = ?'),
    };
  }
  const withViewer = (c, v) => ({ ...c, enrolled: v.enrolled.has(c.id), inCart: v.cart.has(c.id), wished: v.wish.has(c.id) });

  return {
    card, progressFor, viewerState, withViewer,
    categories: () => cats().map(c => ({
      key: c.key, name: { en: c.name_en, ar: c.name_ar }, glyph: c.glyph, hue: c.hue,
      count: db.get("SELECT COUNT(*) AS n FROM courses WHERE category = ? AND status = 'published'", c.key).n,
    })),
    stats() {
      const r = db.get(`SELECT COUNT(*) AS courses, COALESCE(SUM(learners_base),0) AS base, COALESCE(AVG(rating),0) AS rating,
        COUNT(DISTINCT instructor_id) AS instructors FROM courses WHERE status = 'published'`);
      const enrolled = db.get("SELECT COUNT(*) AS n FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.status = 'published'").n;
      return { courses: r.courses, learners: r.base + enrolled, instructors: r.instructors, rating: Math.round(r.rating * 10) / 10 };
    },
    list({ q = '', cat = 'all', level = 'all', price = 'all', sort = 'pop', ids = null } = {}, userId = null) {
      let rows = db.all(`${BASE} WHERE c.status = 'published'`).map(card);
      if (ids) rows = rows.filter(c => ids.includes(c.id));
      const needle = q.toLowerCase();
      const catNames = k => { const c = catByKey(k); return c ? [c.name_en, c.name_ar] : []; };
      rows = rows.filter(c =>
        (!needle || [c.title.en, c.title.ar, c.instructor.name, c.summary.en, c.summary.ar, ...catNames(c.category)].some(s => s && s.toLowerCase().includes(needle))) &&
        (cat === 'all' || c.category === cat) &&
        (level === 'all' || c.level === level || c.level === 'all') &&
        (price === 'all' || (price === 'free' ? c.price === 0 : c.price > 0)));
      rows.sort(SORTS[sort] || SORTS.pop);
      const v = viewerState(userId);
      return rows.map(c => withViewer(c, v));
    },
    /** Raw course row by id (any status). */
    row: id => db.get('SELECT * FROM courses WHERE id = ?', id),
    cardById(id) { const r = db.get(`${BASE} WHERE c.id = ?`, id); return r ? card(r) : null; },
    outline(courseId) {
      const sections = db.all('SELECT * FROM sections WHERE course_id = ? ORDER BY position', courseId);
      const lessons = db.all('SELECT id, section_id, position, title_en, title_ar, minutes, is_preview, video_provider, video_url FROM lessons WHERE course_id = ? ORDER BY position', courseId);
      return sections.map(s => ({
        id: s.id, title: { en: s.title_en, ar: s.title_ar || s.title_en },
        lessons: lessons.filter(l => l.section_id === s.id).map(l => ({
          id: l.id, title: { en: l.title_en, ar: l.title_ar || l.title_en }, minutes: l.minutes, preview: Boolean(l.is_preview),
          hasVideo: Boolean((l.video_provider === 'bunny') || l.video_url),
        })),
      }));
    },
    /** Full course page. Drafts are only visible to their instructor and admins. */
    detail(slug, user) {
      const r = db.get(`${BASE} WHERE c.slug = ?`, slug);
      const canPreview = user && (user.role === 'admin' || user.id === r?.instructor_id);
      if (!r || (r.status !== 'published' && !canPreview)) throw notFound("We couldn't find that course. It may have been removed.");
      const v = viewerState(user?.id);
      const course = withViewer(card(r), v);
      const instructorStats = db.get(`SELECT COUNT(*) AS courses, COALESCE(SUM(learners_base + (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)),0) AS learners
        FROM courses c WHERE instructor_id = ? AND status = 'published'`, r.instructor_id);
      const instructor = db.get('SELECT id, name, headline, bio FROM users WHERE id = ?', r.instructor_id);
      const related = this.list({}, user?.id).filter(c => c.id !== r.id)
        .sort((a, b) => (b.category === r.category) - (a.category === r.category) || (b.level === r.level) - (a.level === r.level)).slice(0, 4);
      return {
        ...course,
        sections: this.outline(r.id),
        quizCount: db.get('SELECT COUNT(*) AS n FROM quiz_questions WHERE course_id = ?', r.id).n,
        instructor: { ...instructor, ...instructorStats },
        progress: user ? progressFor(user.id, r.id) : null,
        related,
      };
    },
  };
}
