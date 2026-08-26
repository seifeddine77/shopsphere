/** True when the request targets the JSON API (as opposed to an EJS page). */
function isApiRequest(req) {
  return req.originalUrl.startsWith('/api');
}

module.exports = { isApiRequest };
