/** Exact frontend origins; never allow every *.vercel.app tenant. */
export function parseAllowedOrigins(value = '') {
  return value.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    let url;
    try { url = new URL(entry); } catch { throw Error('ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw Error('ALLOWED_ORIGINS must contain origins only, without paths, credentials or wildcards.');
    }
    if (url.hostname.includes('*')) throw Error('ALLOWED_ORIGINS does not support wildcards.');
    return url.origin;
  });
}

export function socketOriginOptions(value) {
  const allowed = new Set(parseAllowedOrigins(value));
  return {
    // CORS covers polling. allowRequest also checks the WebSocket handshake.
    cors: {
      origin(origin, callback) { callback(null, Boolean(origin && allowed.has(origin))); },
      methods: ['GET', 'POST'],
    },
    allowRequest(request, callback) {
      const origin = request.headers.origin;
      // Native clients and server-side checks have no browser Origin header.
      // Origin checks are not authentication; room commands still check membership.
      if (!origin) return callback(null, true);
      if (allowed.size) return callback(null, allowed.has(origin));
      try {
        const url = new URL(origin);
        callback(null, ['http:', 'https:'].includes(url.protocol) && url.origin === origin && url.host === request.headers.host);
      } catch { callback(null, false); }
    },
  };
}
