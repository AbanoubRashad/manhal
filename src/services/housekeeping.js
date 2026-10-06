// Scheduled jobs. Reminders run every few minutes; the coach, weekly reports, history purge and
// budget check run hourly. Every job is idempotent, so a missed or repeated run is harmless.
export function housekeepingService(s) {
  const { log } = s;
  const safe = async (name, fn) => {
    try { return await fn(); } catch (err) { log.error('housekeeping job failed', { job: name, err }); return null; }
  };
  return {
    async frequent() {
      return { reminders: await safe('reminders', () => s.live.remind()) };
    },
    async hourly() {
      return {
        reminders: await safe('reminders', () => s.live.remind()),
        purged: await safe('purge', () => s.mentor.purge()),
        nudges: await safe('coach', () => s.coach.run()),
        weekly: await safe('weekly', () => s.reports.weekly()),
        budgetAlert: await safe('budget', () => s.reports.budgetCheck()),
      };
    },
  };
}
