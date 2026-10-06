// In-app notification centre plus email copies, with per-learner channel settings.
// A dedupe key makes every reminder or nudge idempotent: the same event never notifies twice.
import { notFound } from '../lib/errors.js';
import { sqlTime } from '../lib/time.js';

const pair = v => (v && typeof v === 'object' ? { en: v.en || '', ar: v.ar || v.en || '' } : { en: v || '', ar: v || '' });

export function notifyService({ db, config, mailer, now = () => new Date() }) {
  /** Mentor and channel settings for a user, created with defaults on first use. */
  function settings(userId) {
    db.run('INSERT OR IGNORE INTO mentor_settings (user_id) VALUES (?)', userId);
    return db.get('SELECT * FROM mentor_settings WHERE user_id = ?', userId);
  }

  const shape = n => ({
    id: n.id, kind: n.kind, title: { en: n.title_en, ar: n.title_ar }, body: { en: n.body_en, ar: n.body_ar },
    link: n.link, coach: Boolean(n.coach_rule), read: Boolean(n.read_at), createdAt: n.created_at,
  });

  return {
    settings,
    /**
     * Notify a user in the app and, if they allow it, by email.
     * n: { kind, key, title, body, link, cta, coachRule, email: true|false, unsubscribeUrl }
     * Returns the notification id, or null when the dedupe key was already used.
     */
    async push(userId, n) {
      const user = db.get('SELECT id, email, lang FROM users WHERE id = ?', userId);
      if (!user) return null;
      const title = pair(n.title), body = pair(n.body);
      const r = db.run(`INSERT OR IGNORE INTO notifications (user_id, kind, dedupe_key, title_en, title_ar, body_en, body_ar, link, coach_rule, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, userId, n.kind, n.key ?? null, title.en, title.ar, body.en, body.ar, n.link || '', n.coachRule ?? null, sqlTime(now()));
      if (!r.changes) return null;
      const id = r.id;
      if (n.email && settings(userId).email_on) {
        const sent = await mailer.send('notice', user.email, {
          title, lines: [body], cta: n.cta, url: `${config.baseUrl}/n/${id}`, unsubscribeUrl: n.unsubscribeUrl,
          footer: { en: 'You can change which emails you get in Account → Mentor settings.', ar: 'يمكنك اختيار الرسائل التي تصلك من الحساب ← إعدادات المرشد.' },
        }, user.lang);
        if (sent) db.run('UPDATE notifications SET emailed = 1 WHERE id = ?', id);
      }
      return id;
    },
    list(userId, limit = 30) {
      return {
        items: db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit).map(shape),
        unread: this.unread(userId),
      };
    },
    unread: userId => db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).n,
    readAll(userId) {
      db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', sqlTime(now()), userId);
      return { unread: 0 };
    },
    /** Open a notification: marks it read and clicked. Clicking a coach nudge resets the back-off. */
    open(userId, id) {
      const n = db.get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', id, userId);
      if (!n) throw notFound("We couldn't find that notification.");
      const t = sqlTime(now());
      db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?), clicked_at = COALESCE(clicked_at, ?) WHERE id = ?', t, t, id);
      if (n.coach_rule && !n.clicked_at) {
        db.run('INSERT INTO ai_events (user_id, kind, ref_id, created_at) VALUES (?, ?, ?, ?)', userId, 'nudge_clicked', id, t);
        settings(userId);
        db.run('UPDATE mentor_settings SET backoff_reset_at = ? WHERE user_id = ?', t, userId);
      }
      return { link: n.link || '/learning', unread: this.unread(userId) };
    },
  };
}
