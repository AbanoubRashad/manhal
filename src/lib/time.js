/** SQLite-compatible UTC timestamp ("YYYY-MM-DD HH:MM:SS"), comparable as text with datetime('now'). */
export const sqlTime = (date = new Date()) => new Date(date).toISOString().replace('T', ' ').slice(0, 19);

export const addMinutes = (date, min) => new Date(new Date(date).getTime() + min * 60_000);

/** Parse a SQLite timestamp as UTC. */
export const fromSql = s => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);
