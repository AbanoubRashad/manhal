import { validate, id } from '../lib/validate.js';

const LEVEL = { type: 'string', label: 'Level', oneOf: ['beg', 'int', 'adv', 'all'], default: 'beg' };
const PRICE = { type: 'int', label: 'Price', min: 0, max: 20000, default: 0 };

const lesson = {
  id: { type: 'int', min: 1 },
  title_en: { type: 'string', label: 'Lesson title', required: true, max: 140 },
  title_ar: { type: 'string', label: 'Arabic lesson title', max: 140, default: '' },
  minutes: { type: 'int', label: 'Minutes', min: 1, max: 600, default: 10 },
  is_preview: { type: 'bool', default: false },
  video_provider: { type: 'string', label: 'Video source', oneOf: ['url', 'bunny'], default: 'url' },
  video_url: { type: 'string', label: 'Video link', max: 500, default: '' },
  video_ref: { type: 'string', label: 'Bunny video ID', max: 64, default: '' },
  body: { type: 'string', label: 'Lesson text', max: 20_000, default: '' },
  transcript: { type: 'string', label: 'Transcript', max: 60_000, default: '' },
};
const section = {
  id: { type: 'int', min: 1 },
  title_en: { type: 'string', label: 'Section title', required: true, max: 120 },
  title_ar: { type: 'string', label: 'Arabic section title', max: 120, default: '' },
  lessons: { type: 'array', label: 'Lessons', max: 100, default: [], items: { schema: lesson } },
};
const question = {
  prompt: { type: 'string', label: 'Question', required: true, max: 300 },
  options: { type: 'array', label: 'Options', required: true, min: 2, max: 6, items: { type: 'string', label: 'Option', required: true, max: 200 } },
  answer: { type: 'int', label: 'Correct option', required: true, min: 0, max: 5 },
};
export const courseSchema = {
  title_en: { type: 'string', label: 'Title', required: true, min: 4, max: 120 },
  title_ar: { type: 'string', label: 'Arabic title', max: 120, default: '' },
  summary_en: { type: 'string', label: 'Summary', max: 400, default: '' },
  summary_ar: { type: 'string', label: 'Arabic summary', max: 400, default: '' },
  category: { type: 'string', label: 'Category', required: true, max: 20 },
  level: LEVEL,
  price: PRICE,
  sections: { type: 'array', label: 'Sections', max: 30, default: [], items: { schema: section } },
  quiz: { type: 'array', label: 'Checkpoint', max: 30, default: [], items: { schema: question } },
};

export default function studioRoutes(r, s) {
  const { studio, earnings, limits } = s;
  const inst = { auth: 'instructor' };

  r.get('/api/studio/courses', ctx => ({ courses: studio.list(ctx.user) }), inst);
  r.post('/api/studio/courses', ctx => {
    const body = validate(ctx.body, { title_en: courseSchema.title_en, category: courseSchema.category, level: LEVEL, price: PRICE });
    return { status: 201, body: { course: studio.create(ctx.user, body) } };
  }, inst);
  r.get('/api/studio/courses/:id', ctx => ({ course: studio.get(ctx.user, id(ctx.params.id, 'course')) }), inst);
  r.put('/api/studio/courses/:id', ctx => ({ course: studio.save(ctx.user, id(ctx.params.id, 'course'), validate(ctx.body, courseSchema)) }), inst);
  r.post('/api/studio/courses/:id/status', ctx => {
    const { status } = validate(ctx.body, { status: { type: 'string', label: 'Status', required: true, oneOf: ['draft', 'published'] } });
    return { course: studio.setStatus(ctx.user, id(ctx.params.id, 'course'), status) };
  }, inst);

  r.get('/api/studio/earnings', ctx => earnings.summary(ctx.user.id), inst);
  r.post('/api/studio/payouts', ctx => {
    limits.email.hit(`payout:${ctx.user.id}`);
    const body = validate(ctx.body, {
      amount: { type: 'int', label: 'Amount', required: true, min: 1, max: 10_000_000 },
      method: { type: 'string', label: 'Payout method', required: true, oneOf: ['bank', 'instapay', 'wallet'] },
      details: { type: 'string', label: 'Payout details', required: true, min: 4, max: 300 },
    });
    return { status: 201, body: { payout: earnings.requestPayout(ctx.user.id, body) } };
  }, inst);
}
