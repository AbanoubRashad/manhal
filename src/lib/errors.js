/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg, extra) => new HttpError(400, msg, extra);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg);
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg);
export const notFound = (msg = "We couldn't find that.") => new HttpError(404, msg);
export const conflict = msg => new HttpError(409, msg);
export const tooMany = (msg = 'Too many attempts. Please wait a few minutes and try again.') => new HttpError(429, msg);
