// Course knowledge index for Nour: lesson text, transcripts, text files and approved Q&A
// answers, split into chunks and searched with SQLite FTS5 (or keyword scoring when the
// SQLite build has no FTS5). Search only ever returns lessons the caller may see.

const STOP = new Set(('a an and are as at be by can could did do does for from had has have how i in is it its me my of on or our please '
  + 'should so than that the their them then there these this to was we were what when where which who why will with would you your '
  + 'lesson lessons explain tell more about example give mean means meaning '
  + 'في من على ما ماذا كيف هل هو هي عن الى إلى يعني ايه إيه ازاي إزاي اشرح شرح مثال الدرس دي ده اللي ممكن عايز عاوز لو انا أنا لي ليا بتاع بسيط ببساطة الفكرة').split(' '));

/** Lower-cased search terms, without stop words. */
export function terms(text) {
  return [...new Set(String(text || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w => w.length > 1 && !STOP.has(w)))].slice(0, 12);
}

/** Split text into chunks of about `size` characters on paragraph, then sentence, boundaries. */
export function chunk(text, size = 700) {
  const paras = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out = [];
  let cur = '';
  const push = s => { if (s.trim()) out.push(s.trim()); };
  for (const p of paras) {
    const pieces = p.length > size ? p.match(/[^.!?؟]+[.!?؟]*\s*/g) || [p] : [p];
    for (const piece of pieces) {
      if (cur && cur.length + piece.length > size) { push(cur); cur = ''; }
      cur += (cur && !/\s$/.test(cur) ? '\n\n' : '') + piece;
    }
  }
  push(cur);
  return out;
}

export function knowledgeService({ db, config }) {
  const hasFts = Boolean(db.get("SELECT 1 AS x FROM sqlite_master WHERE name = 'knowledge_fts'"));
  const useFts = () => hasFts && config.ai.search !== 'keyword';

  function add(courseId, lessonId, source, sourceId, text) {
    for (const piece of chunk(text)) {
      const { id } = db.run('INSERT INTO knowledge_chunks (course_id, lesson_id, source, source_id, text) VALUES (?, ?, ?, ?, ?)', courseId, lessonId, source, sourceId, piece);
      if (hasFts) db.run('INSERT INTO knowledge_fts (rowid, text) VALUES (?, ?)', id, piece);
    }
  }
  function remove(where, ...params) {
    const ids = db.all(`SELECT id FROM knowledge_chunks WHERE ${where}`, ...params).map(r => r.id);
    for (const id of ids) {
      if (hasFts) db.run('DELETE FROM knowledge_fts WHERE rowid = ?', id);
      db.run('DELETE FROM knowledge_chunks WHERE id = ?', id);
    }
  }

  function indexLesson(l) {
    remove("lesson_id = ? AND source IN ('lesson','transcript','file')", l.id);
    if (l.body) add(l.course_id, l.id, 'lesson', l.id, l.body);
    if (l.transcript) add(l.course_id, l.id, 'transcript', l.id, l.transcript);
    for (const f of db.all('SELECT id, name, text FROM lesson_files WHERE lesson_id = ?', l.id)) add(l.course_id, l.id, 'file', f.id, `${f.name}\n\n${f.text}`);
  }

  /** Lesson number and title for citations, e.g. "Lesson 3 – Joins". */
  const lessonLabel = id => {
    const l = db.get('SELECT id, position, title_en, title_ar FROM lessons WHERE id = ?', id);
    return l ? { id: l.id, n: l.position + 1, title: { en: l.title_en, ar: l.title_ar || l.title_en } } : null;
  };

  return {
    hasFts, useFts, lessonLabel,
    /** Rebuild every lesson chunk of a course (after the studio saves it). Q&A answers are kept. */
    reindexCourse(courseId) {
      db.tx(() => {
        remove("course_id = ? AND source IN ('lesson','transcript','file')", courseId);
        for (const l of db.all('SELECT * FROM lessons WHERE course_id = ?', courseId)) indexLesson(l);
      });
    },
    indexLesson: id => { const l = db.get('SELECT * FROM lessons WHERE id = ?', id); if (l) db.tx(() => indexLesson(l)); },
    /** Add an approved answer (instructor or checked AI) so the tutor learns the instructor's explanations. */
    indexAnswer(answerId) {
      const a = db.get(`SELECT a.*, q.course_id, q.lesson_id, q.title, q.body AS qbody FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.id = ?`, answerId);
      db.tx(() => {
        remove("source = 'answer' AND source_id = ?", answerId);
        if (a) add(a.course_id, a.lesson_id, 'answer', a.id, `Learner question: ${a.title}${a.qbody ? `\n${a.qbody}` : ''}\n\nInstructor's answer: ${a.body}`);
      });
    },
    removeAnswer: answerId => db.tx(() => remove("source = 'answer' AND source_id = ?", answerId)),

    /**
     * Find the chunks most relevant to `query` in one course, limited to `allowed` lesson ids.
     * The current lesson ranks first; its opening chunk is always included so mode prompts
     * ("Explain simply") have material. Returns { chunks, matched } where matched counts real hits.
     */
    search({ courseId, query, lessonId, allowed, limit = 5 }) {
      const words = terms(query);
      let hits = [];
      if (words.length && useFts()) {
        const match = words.map(w => `"${w.replace(/"/g, '""')}"`).join(' OR ');
        try {
          hits = db.all(`SELECT k.*, bm25(knowledge_fts) AS rank FROM knowledge_fts JOIN knowledge_chunks k ON k.id = knowledge_fts.rowid
            WHERE knowledge_fts MATCH ? AND k.course_id = ? ORDER BY rank LIMIT 60`, match, courseId).map(r => ({ ...r, score: -r.rank + 1e-6 }));
        } catch { hits = []; }
      } else if (words.length) {
        const rows = db.all('SELECT * FROM knowledge_chunks WHERE course_id = ?', courseId);
        const df = Object.fromEntries(words.map(w => [w, rows.filter(r => r.text.toLowerCase().includes(w)).length]));
        hits = rows.map(r => {
          const low = r.text.toLowerCase();
          const score = words.reduce((s, w) => {
            const n = low.split(w).length - 1;
            return s + (n ? (1 + Math.log(n)) * Math.log(1 + rows.length / df[w]) : 0);
          }, 0);
          return { ...r, score };
        }).filter(r => r.score > 0);
      }
      const ok = r => (r.lesson_id == null ? false : allowed.has(r.lesson_id));
      hits = hits.filter(ok).map(r => ({ ...r, score: r.lesson_id === lessonId ? r.score * 1.6 : r.score })).sort((a, b) => b.score - a.score).slice(0, limit);
      const matched = hits.length;
      if (lessonId && allowed.has(lessonId) && !hits.some(h => h.lesson_id === lessonId)) {
        const first = db.get("SELECT * FROM knowledge_chunks WHERE lesson_id = ? AND source IN ('lesson','transcript') ORDER BY id LIMIT 1", lessonId);
        if (first) hits = [{ ...first, score: 0 }, ...hits].slice(0, limit);
      }
      hits.sort((a, b) => (b.lesson_id === lessonId) - (a.lesson_id === lessonId) || b.score - a.score);
      return { chunks: hits.map(h => ({ id: h.id, lessonId: h.lesson_id, source: h.source, text: h.text, score: h.score, lesson: lessonLabel(h.lesson_id) })), matched };
    },
  };
}
