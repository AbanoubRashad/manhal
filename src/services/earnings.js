import { badRequest, notFound, conflict } from '../lib/errors.js';

export const MIN_PAYOUT = 100;

/** Revenue share, instructor earnings ledger and payout requests. Amounts are whole EGP. */
export function earningsService({ db }) {
  const share = () => Number(db.get("SELECT value FROM settings WHERE key = 'revenue_share'")?.value ?? 0.7);

  function balance(instructorId) {
    const r = db.get(`SELECT
        (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE instructor_id = ?) AS earned,
        (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE instructor_id = ? AND kind = 'sale') AS gross_share,
        (SELECT COALESCE(SUM(amount),0) FROM payouts WHERE instructor_id = ? AND status = 'paid') AS paid_out,
        (SELECT COALESCE(SUM(amount),0) FROM payouts WHERE instructor_id = ? AND status = 'requested') AS requested`,
      instructorId, instructorId, instructorId, instructorId);
    return { earned: r.earned, paidOut: r.paid_out, requested: r.requested, available: r.earned - r.paid_out - r.requested };
  }

  return {
    share,
    setShare(value) {
      db.run("INSERT INTO settings (key, value) VALUES ('revenue_share', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(value));
      return share();
    },
    /** Credit instructors for a paid order. Safe to call twice (unique per order + course + kind). */
    recordSale(orderId) {
      const s = share();
      for (const it of db.all('SELECT * FROM order_items WHERE order_id = ?', orderId)) {
        if (it.paid <= 0) continue;
        db.run(`INSERT OR IGNORE INTO earnings (instructor_id, order_id, course_id, kind, gross, share, amount)
          VALUES (?, ?, ?, 'sale', ?, ?, ?)`, it.instructor_id, orderId, it.course_id, it.paid, s, Math.round(it.paid * s));
      }
    },
    /** Reverse the sale entries of a refunded order using the share that applied at sale time. */
    recordRefund(orderId) {
      for (const e of db.all("SELECT * FROM earnings WHERE order_id = ? AND kind = 'sale'", orderId)) {
        db.run(`INSERT OR IGNORE INTO earnings (instructor_id, order_id, course_id, kind, gross, share, amount)
          VALUES (?, ?, ?, 'refund', ?, ?, ?)`, e.instructor_id, orderId, e.course_id, -e.gross, e.share, -e.amount);
      }
    },
    balance,
    summary(instructorId) {
      const ledger = db.all(`SELECT e.*, c.title_en, c.title_ar FROM earnings e JOIN courses c ON c.id = e.course_id
        WHERE e.instructor_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 200`, instructorId).map(e => ({
        id: e.id, orderId: e.order_id, kind: e.kind, gross: e.gross, share: e.share, amount: e.amount, createdAt: e.created_at,
        course: { id: e.course_id, title: { en: e.title_en, ar: e.title_ar || e.title_en } },
      }));
      const months = db.all(`SELECT substr(created_at,1,7) AS month, SUM(amount) AS amount FROM earnings
        WHERE instructor_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`, instructorId).reverse();
      const payouts = db.all('SELECT * FROM payouts WHERE instructor_id = ? ORDER BY requested_at DESC, id DESC', instructorId).map(shapePayout);
      return { share: share(), minPayout: MIN_PAYOUT, balance: balance(instructorId), ledger, months, payouts };
    },
    requestPayout(instructorId, { amount, method, details }) {
      return db.tx(() => {
        const b = balance(instructorId);
        if (amount < MIN_PAYOUT) throw badRequest(`The minimum payout is ${MIN_PAYOUT} EGP.`, { fields: { amount: `Minimum ${MIN_PAYOUT} EGP.` } });
        if (amount > b.available) throw badRequest(`You can request up to ${Math.max(0, b.available)} EGP right now.`, { fields: { amount: 'More than your available balance.' } });
        const { id } = db.run('INSERT INTO payouts (instructor_id, amount, method, details) VALUES (?, ?, ?, ?)', instructorId, amount, method, details);
        return shapePayout(db.get('SELECT * FROM payouts WHERE id = ?', id));
      });
    },
    listPayouts(status) {
      const rows = db.all(`SELECT p.*, u.name, u.email FROM payouts p JOIN users u ON u.id = p.instructor_id
        ${status ? 'WHERE p.status = ?' : ''} ORDER BY p.status = 'requested' DESC, p.requested_at DESC, p.id DESC`, ...(status ? [status] : []));
      return rows.map(p => ({ ...shapePayout(p), instructor: { id: p.instructor_id, name: p.name, email: p.email }, balance: balance(p.instructor_id) }));
    },
    decide(id, action, note = '') {
      const p = db.get('SELECT * FROM payouts WHERE id = ?', id);
      if (!p) throw notFound("We couldn't find that payout request.");
      if (p.status !== 'requested') throw conflict(`This payout is already marked ${p.status}.`);
      db.run("UPDATE payouts SET status = ?, admin_note = ?, decided_at = datetime('now') WHERE id = ? AND status = 'requested'",
        action === 'paid' ? 'paid' : 'rejected', note, id);
      return shapePayout(db.get('SELECT * FROM payouts WHERE id = ?', id));
    },
  };
}

const shapePayout = p => ({
  id: p.id, amount: p.amount, method: p.method, details: p.details, status: p.status,
  note: p.admin_note, requestedAt: p.requested_at, decidedAt: p.decided_at,
});
