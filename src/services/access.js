// Who may see which lessons. Used by the player, the tutor and Q&A so the AI can never
// hand a learner content they couldn't open themselves.

export function accessService({ db, catalog, now = () => new Date() }) {
  /** Manhal Plus isn't on sale yet. When it is, return true here for active members. */
  const isPlus = () => false;
  const teaches = (user, course) => Boolean(user && course && (user.role === 'admin' || course.instructor_id === user.id));
  const enrolled = (user, courseId) => Boolean(user && db.get('SELECT 1 AS x FROM enrollments WHERE user_id = ? AND course_id = ?', user.id, courseId));

  /** 'full' (enrolled, teaching or Plus), 'preview' (published course, preview lessons only) or 'none'. */
  function level(user, course) {
    if (!course) return 'none';
    if (teaches(user, course) || enrolled(user, course.id) || (isPlus(user) && course.status === 'published')) return 'full';
    return course.status === 'published' ? 'preview' : 'none';
  }

  return {
    isPlus, teaches, enrolled, level,
    /** Lesson ids this user may read in a course. */
    allowedLessons(user, courseId) {
      const course = catalog.row(courseId);
      const lv = level(user, course);
      if (lv === 'none') return new Set();
      const rows = db.all(`SELECT id FROM lessons WHERE course_id = ? ${lv === 'full' ? '' : 'AND is_preview = 1'}`, courseId);
      return new Set(rows.map(r => r.id));
    },
    hasAccess(user, lessonId) {
      const l = db.get('SELECT id, course_id, is_preview FROM lessons WHERE id = ?', lessonId);
      if (!l) return false;
      const lv = level(user, catalog.row(l.course_id));
      return lv === 'full' || (lv === 'preview' && Boolean(l.is_preview));
    },
    /** Under 18, judged from the birth year alone, so someone who may still be 17 counts as a minor. */
    isMinor(user) {
      const y = Number(user?.birth_year);
      return Boolean(y) && new Date(now()).getUTCFullYear() - y <= 18;
    },
  };
}
