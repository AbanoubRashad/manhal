import { validate, id } from '../lib/validate.js';

export default function cartRoutes(r, s) {
  const { cart, orders } = s;
  const user = { auth: 'user' };

  r.get('/api/cart', ctx => ({ cart: cart.view(ctx.user.id) }), user);
  r.post('/api/cart', ctx => {
    const { courseId } = validate(ctx.body, { courseId: { type: 'int', label: 'Course', required: true, min: 1 } });
    return { cart: cart.add(ctx.user.id, courseId) };
  }, user);
  r.post('/api/cart/coupon', ctx => {
    const { code } = validate(ctx.body, { code: { type: 'string', label: 'Coupon code', required: true, max: 40 } });
    return { cart: cart.applyCoupon(ctx.user.id, code) };
  }, user);
  r.delete('/api/cart/coupon', ctx => ({ cart: cart.removeCoupon(ctx.user.id) }), user);
  r.delete('/api/cart/:id', ctx => ({ cart: cart.remove(ctx.user.id, id(ctx.params.id, 'course')) }), user);

  r.post('/api/checkout', ctx => orders.checkout(ctx.user), user);
  r.get('/api/orders', ctx => ({ orders: orders.listForUser(ctx.user.id) }), user);
  r.get('/api/orders/:id', ctx => ({ order: orders.view(id(ctx.params.id, 'order'), ctx.user) }), user);
}
