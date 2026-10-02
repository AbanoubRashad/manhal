// Phase 3: optional protected video provider per lesson. Existing video_url links keep working.
export default {
  version: 4,
  name: 'video-provider',
  up: db => db.exec(`
    ALTER TABLE lessons ADD COLUMN video_provider TEXT NOT NULL DEFAULT 'url';
    ALTER TABLE lessons ADD COLUMN video_ref TEXT NOT NULL DEFAULT '';
  `),
};
