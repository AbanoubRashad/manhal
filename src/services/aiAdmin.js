// Admin → AI: usage and cost, the budget, feature switches, safety reports and flags, and the
// A/B experiment's impact numbers. Distress flags show only who and when, never the chat.
import { badRequest, notFound } from '../lib/errors.js';
import { sqlTime } from '../lib/time.js';

export const AI_FEATURES = ['ai_tutor', 'ai_coach', 'ai_drafts', 'ai_polish'];

export function aiAdminService({ db, config, ai, now = () => new Date() }) {
  const t = () => sqlTime(now());
  const sum = since => db.get(`SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(input_tokens + cache_read_tokens + cache_write_tokens),0) AS input,
    COALESCE(SUM(output_tokens),0) AS output, COALESCE(SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END),0) AS failed FROM ai_usage WHERE created_at >= ?`, since);
  const tutorMessages = since => db.get("SELECT COUNT(*) AS n FROM ai_messages WHERE role = 'user' AND created_at >= ?", since).n;

  function impact() {
    const groups = ['mentor', 'control'].map(g => {
      const ids = db.all('SELECT id FROM users WHERE ab_group = ?', g).map(r => r.id);
      const n = ids.length;
      const ph = ids.map(() => '?').join(',') || 'NULL';
      const share = (num, den) => (den ? Math.round(num / den * 1000) / 10 : null);
      const active = days => db.get(`SELECT COUNT(DISTINCT user_id) AS n FROM lesson_progress WHERE user_id IN (${ph}) AND completed_at >= ?`, ...ids, sqlTime(new Date(now() - days * 86400000))).n;
      const enrolls = db.get(`SELECT COUNT(*) AS n FROM enrollments WHERE user_id IN (${ph})`, ...ids).n;
      const certs = db.get(`SELECT COUNT(*) AS n FROM certificates WHERE user_id IN (${ph})`, ...ids).n;
      const buyers = db.all(`SELECT user_id, COUNT(*) AS n FROM orders WHERE status = 'paid' AND user_id IN (${ph}) GROUP BY user_id`, ...ids);
      const sent = db.get(`SELECT COUNT(*) AS n FROM notifications WHERE kind = 'coach' AND user_id IN (${ph})`, ...ids).n;
      const clicked = db.get(`SELECT COUNT(*) AS n FROM notifications WHERE kind = 'coach' AND clicked_at IS NOT NULL AND user_id IN (${ph})`, ...ids).n;
      const rated = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN m.rating > 0 THEN 1 ELSE 0 END),0) AS up FROM ai_messages m
        JOIN ai_conversations c ON c.id = m.conversation_id WHERE m.rating IS NOT NULL AND c.user_id IN (${ph})`, ...ids);
      return {
        group: g, size: n,
        lessons7: share(active(7), n), lessons30: share(active(30), n),
        courseCompletion: share(certs, enrolls),
        repeatPurchase: share(buyers.filter(b => b.n >= 2).length, buyers.length),
        nudgeClickRate: share(clicked, sent),
        helpful: share(rated.up, rated.n),
      };
    });
    return { on: config.ai.experiment, groups, tooEarly: groups.some(g => g.size < 100) };
  }

  return {
    overview() {
      const day = t().slice(0, 10) + ' 00:00:00', month = t().slice(0, 7) + '-01 00:00:00';
      const features = Object.fromEntries(AI_FEATURES.map(k => [k, db.get('SELECT value FROM settings WHERE key = ?', k)?.value !== '0']));
      return {
        provider: ai.provider, models: ai.models,
        today: { ...sum(day), messages: tutorMessages(day) },
        month: { ...sum(month), messages: tutorMessages(month) },
        budget: ai.budget(),
        byFeature: db.all(`SELECT feature, COUNT(*) AS calls, COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(output_tokens),0) AS output
          FROM ai_usage WHERE created_at >= ? GROUP BY feature ORDER BY cost DESC`, month),
        topUsers: db.all(`SELECT u.id, u.name, COUNT(*) AS calls, COALESCE(SUM(a.cost_usd),0) AS cost FROM ai_usage a JOIN users u ON u.id = a.user_id
          WHERE a.created_at >= ? GROUP BY u.id ORDER BY cost DESC, calls DESC LIMIT 10`, month),
        features,
        flags: db.all(`SELECT f.*, u.name AS user_name FROM ai_flags f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.status = 'open' DESC, f.id DESC LIMIT 50`).map(f => ({
          id: f.id, kind: f.kind, status: f.status, reason: f.reason, createdAt: f.created_at, user: f.user_name,
          // Reports show the AI reply that was reported; distress flags never show the conversation.
          reply: f.kind === 'report' ? db.get("SELECT text FROM ai_messages WHERE id = ? AND role = 'assistant'", f.message_id)?.text ?? null : null,
          course: db.get(`SELECT co.title_en FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id JOIN courses co ON co.id = c.course_id WHERE m.id = ?`, f.message_id)?.title_en ?? null,
        })),
        impact: impact(),
      };
    },
    setFeature(key, on) {
      if (!AI_FEATURES.includes(key)) throw badRequest('Unknown AI feature.');
      db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, on ? '1' : '0');
      return this.overview().features;
    },
    resolveFlag(id) {
      if (!db.run("UPDATE ai_flags SET status = 'resolved' WHERE id = ?", id).changes) throw notFound("We couldn't find that flag.");
      return { resolved: true };
    },
    impact,
  };
}
