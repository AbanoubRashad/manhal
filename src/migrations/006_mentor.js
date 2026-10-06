// Phase 5: Nour, the AI study mentor. Lesson material and its search index, tutor chat,
// usage and cost logs, coach settings, notifications, live sessions, Q&A with AI drafts,
// announcements, safety reports and the A/B experiment. Existing data is untouched.
export default {
  version: 6,
  name: 'ai-mentor',
  up: db => {
    db.exec(`
    ALTER TABLE lessons ADD COLUMN body TEXT NOT NULL DEFAULT '';
    ALTER TABLE lessons ADD COLUMN transcript TEXT NOT NULL DEFAULT '';
    ALTER TABLE courses ADD COLUMN ai_answer_mode TEXT NOT NULL DEFAULT 'draft';
    ALTER TABLE users ADD COLUMN tz TEXT NOT NULL DEFAULT 'Africa/Cairo';
    ALTER TABLE users ADD COLUMN birth_year INTEGER;
    ALTER TABLE users ADD COLUMN ab_group TEXT;

    CREATE TABLE lesson_files (
      id INTEGER PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX lesson_files_lesson ON lesson_files(lesson_id);

    CREATE TABLE knowledge_chunks (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK (source IN ('lesson','transcript','file','answer')),
      source_id INTEGER,
      text TEXT NOT NULL
    );
    CREATE INDEX knowledge_course ON knowledge_chunks(course_id);
    CREATE INDEX knowledge_source ON knowledge_chunks(source, source_id);

    CREATE TABLE ai_conversations (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, course_id)
    );
    CREATE TABLE ai_messages (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      text TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'explain',
      lesson_id INTEGER,
      citations_json TEXT NOT NULL DEFAULT '[]',
      kind TEXT NOT NULL DEFAULT 'answer',
      rating INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX ai_messages_conv ON ai_messages(conversation_id, id);

    CREATE TABLE ai_usage (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      ok INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX ai_usage_time ON ai_usage(created_at);
    CREATE INDEX ai_usage_user ON ai_usage(user_id, feature, created_at);

    CREATE TABLE ai_cache (
      key TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE ai_flags (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('report','distress')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message_id INTEGER,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE ai_events (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      kind TEXT NOT NULL,
      ref_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX ai_events_kind ON ai_events(kind, created_at);

    CREATE TABLE mentor_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_on INTEGER NOT NULL DEFAULT 1,
      intensity TEXT NOT NULL DEFAULT 'gentle' CHECK (intensity IN ('gentle','balanced','push')),
      email_on INTEGER NOT NULL DEFAULT 1,
      study_time TEXT NOT NULL DEFAULT 'any' CHECK (study_time IN ('any','morning','afternoon','evening')),
      backoff_reset_at TEXT,
      parent_email TEXT,
      parent_token_hash TEXT,
      parent_confirmed_at TEXT
    );

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      dedupe_key TEXT,
      title_en TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      body_en TEXT NOT NULL DEFAULT '',
      body_ar TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      coach_rule TEXT,
      emailed INTEGER NOT NULL DEFAULT 0,
      read_at TEXT,
      clicked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, dedupe_key)
    );
    CREATE INDEX notifications_user ON notifications(user_id, id);

    CREATE TABLE live_sessions (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 60,
      link TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX live_sessions_course ON live_sessions(course_id, starts_at);

    CREATE TABLE announcements (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE questions (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX questions_course ON questions(course_id, id);
    CREATE TABLE answers (
      id INTEGER PRIMARY KEY,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('instructor','ai')),
      body TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      checked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX answers_question ON answers(question_id);
    CREATE TABLE ai_drafts (
      question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      citations_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK (status IN ('draft','none','sent','edited','discarded','posted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE report_log (
      kind TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (kind, ref_id, period)
    );

    INSERT INTO settings (key, value) VALUES ('ai_tutor', '1'), ('ai_coach', '1'), ('ai_drafts', '1'), ('ai_polish', '1');
  `);
    // Full-text search over the knowledge chunks. Some SQLite builds lack FTS5; search falls back to keyword scoring.
    try {
      db.exec("CREATE VIRTUAL TABLE knowledge_fts USING fts5(text, tokenize = 'unicode61 remove_diacritics 2')");
    } catch { /* no FTS5 in this build */ }
  },
};
