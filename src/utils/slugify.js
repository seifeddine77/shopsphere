/**
 * URL-safe slug generation with accent normalization.
 * "Café & Théière №2" -> "cafe-theiere-2"
 */
function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a slug guaranteed to be unique within a model.
 *
 * @param {mongoose.Model} model
 * @param {string} source       text to derive the slug from
 * @param {object} [excludeDoc] {_id} to ignore when updating an existing document
 */
async function uniqueSlug(model, source, excludeDoc = null) {
  const base = slugify(source) || 'item';
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`;
    const query = { slug: candidate };
    if (excludeDoc && excludeDoc._id) {
      query._id = { $ne: excludeDoc._id };
    }
     
    const exists = await model.exists(query);
    if (!exists) return candidate;
  }
  throw new Error(`Could not generate a unique slug for "${source}"`);
}

module.exports = { slugify, uniqueSlug };
