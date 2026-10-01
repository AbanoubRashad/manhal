import { validate, id } from '../lib/validate.js';

export default function learningRoutes(r, s) {
  const { learning } = s;
  const user = { auth: 'user' };

  r.get('/api/learning', ctx => learning.dashboard(ctx.user), user);
  r.get('/api/learn/:slug', ctx => learning.player(ctx.user, ctx.params.slug), user);

  // Playback is public for preview lessons, so auth is checked inside the service.
  r.get('/api/lessons/:id/play', ctx => ({ video: learning.play(ctx.user, id(ctx.params.id, 'lesson')) }));
  r.post('/api/lessons/:id/complete', ctx => ({ progress: learning.complete(ctx.user, id(ctx.params.id, 'lesson')) }), user);
  r.get('/api/lessons/:id/note', ctx => learning.getNote(ctx.user, id(ctx.params.id, 'lesson')), user);
  r.put('/api/lessons/:id/note', ctx => {
    const { body } = validate(ctx.body, { body: { type: 'string', label: 'Note', max: 20000, default: '' } });
    return learning.saveNote(ctx.user, id(ctx.params.id, 'lesson'), body);
  }, user);

  r.get('/api/courses/:id/quiz', ctx => learning.quiz(ctx.user, id(ctx.params.id, 'course')), user);
  r.post('/api/courses/:id/quiz', ctx => {
    const { answers } = validate(ctx.body, { answers: { type: 'array', label: 'Answers', required: true, max: 50, items: { type: 'int', label: 'Answer', required: true, min: 0, max: 9 } } });
    return learning.submitQuiz(ctx.user, id(ctx.params.id, 'course'), answers);
  }, user);

  r.post('/api/courses/:id/certificate', ctx => {
    const { name } = validate(ctx.body, { name: { type: 'string', label: 'Name on certificate', max: 60 } });
    return { certificate: learning.certificate(ctx.user, id(ctx.params.id, 'course'), name) };
  }, user);
}
