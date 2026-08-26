/**
 * Display formatting helpers exposed to all EJS templates via app.locals.
 */

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatPrice(value) {
  return priceFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Discount percentage between regular and discounted price (0 when none) */
function discountPercent(product) {
  if (!product || product.discountPrice == null || !product.price) return 0;
  return Math.round((1 - product.discountPrice / product.price) * 100);
}

module.exports = { formatPrice, formatDate, discountPercent };
