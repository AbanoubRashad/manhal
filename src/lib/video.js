import { sha256 } from './crypto.js';

/*
 * Video providers. A lesson is either:
 *   video_provider = 'url'   with video_url: a YouTube, Vimeo or direct .mp4/.webm link (public by nature), or
 *   video_provider = 'bunny' with video_ref: a Bunny Stream video GUID, served as a signed, expiring embed URL.
 * Callers must check enrollment before calling playback(): the URL is the access grant.
 */

/** Parse a YouTube / Vimeo / file URL into an embeddable source. Returns null for unsupported links. */
export function parseVideoUrl(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
    return /^[\w-]{6,20}$/.test(id || '') ? { type: 'embed', kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean).find(p => /^\d+$/.test(p));
    return id ? { type: 'embed', kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm|m4v)$/i.test(u.pathname)) return { type: 'file', kind: 'file', src: u.href };
  return null;
}

/** Bunny Stream embed token authentication: SHA256_HEX(token_key + video_id + expires). */
export function bunnySignedUrl({ libraryId, tokenKey, videoId, ttl, now = Date.now() }) {
  const expires = Math.floor(now / 1000) + ttl;
  const token = sha256(tokenKey + videoId + expires);
  return { src: `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}?token=${token}&expires=${expires}&autoplay=false`, expires };
}

export function createVideo(cfg) {
  const bunnyReady = Boolean(cfg.bunnyLibraryId && cfg.bunnyTokenKey);
  return {
    bunnyReady,
    /** Playback info for a lesson the caller is allowed to watch. */
    playback(lesson, now = Date.now()) {
      if (lesson.video_provider === 'bunny' && lesson.video_ref) {
        if (!bunnyReady) return { type: 'unavailable', reason: 'Protected video is not configured on this server yet.' };
        const s = bunnySignedUrl({ libraryId: cfg.bunnyLibraryId, tokenKey: cfg.bunnyTokenKey, videoId: lesson.video_ref, ttl: cfg.ttl, now });
        return { type: 'embed', kind: 'bunny', src: s.src, expiresAt: new Date(s.expires * 1000).toISOString() };
      }
      const parsed = parseVideoUrl(lesson.video_url);
      return parsed || { type: 'none' };
    },
  };
}
