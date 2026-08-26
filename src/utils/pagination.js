/**
 * Reusable server-side pagination.
 *
 * Query contract:  ?page=2&limit=12
 * Response shape:
 * {
 *   currentPage, totalPages, totalItems,
 *   itemsPerPage, hasNextPage, hasPreviousPage
 * }
 */

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 60;

function coerceInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Parses and clamps ?page & ?limit from a query object */
function parsePaginationQuery(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const page = coerceInt(query.page, 1, 1, 100000);
  const limit = coerceInt(query.limit, defaultLimit, 1, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

/** Builds the pagination metadata returned alongside paginated results */
function buildPagination(page, limit, totalItems) {
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  return {
    currentPage: page,
    totalPages,
    totalItems,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

module.exports = { parsePaginationQuery, buildPagination };
