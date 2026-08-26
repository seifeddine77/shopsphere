/* ShopSphere - cart & wishlist page interactions.
   Mutations go through the JSON API; on success the page reloads so the
   server-rendered totals always come from a single source of truth. */

(function () {
  'use strict';

  /* ------------------------------- Cart ----------------------------------- */

  function setQuantity(productId, quantity) {
    return window.app.api(`/api/cart/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    }).then(() => window.location.reload());
  }

  document.querySelectorAll('.js-cart-increase, .js-cart-decrease').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.cart-row');
      if (!row || row.classList.contains('cart-row-disabled')) return;
      const input = row.querySelector('.js-cart-qty');
      const delta = button.classList.contains('js-cart-increase') ? 1 : -1;
      const next = Math.min(Math.max(Number.parseInt(input.value, 10) + delta, 1), 99);
      setQuantity(button.dataset.productId, next);
    });
  });

  document.querySelectorAll('.js-cart-qty').forEach((input) => {
    input.addEventListener('change', () => {
      const value = Math.min(Math.max(Number.parseInt(input.value, 10) || 1, 1), 99);
      setQuantity(input.dataset.productId, value);
    });
  });

  document.querySelectorAll('.js-remove-item').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.app.api(`/api/cart/${button.dataset.productId}`, { method: 'DELETE' });
        window.location.reload();
      } catch (error) {
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  document.querySelectorAll('.js-clear-cart').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.app.api('/api/cart', { method: 'DELETE' });
        window.app.updateBadge('cart', 0);
        window.location.reload();
      } catch (error) {
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* ------------------------------ Wishlist -------------------------------- */

  document.querySelectorAll('.js-wishlist-remove').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await window.app.api(`/api/wishlist/${button.dataset.productId}`, { method: 'DELETE' });
        window.location.reload();
      } catch (error) {
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  document.querySelectorAll('.js-move-to-cart').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await window.app.api(
          `/api/wishlist/${button.dataset.productId}/move-to-cart`,
          { method: 'DELETE', body: JSON.stringify({ quantity: 1 }) },
        );
        window.app.updateBadge('cart', result.data.cart.itemCount);
        window.app.showToast('Moved to cart', 'success');
        setTimeout(() => window.location.reload(), 600);
      } catch (error) {
        button.disabled = false;
        if (error.status === 401) {
          window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* --------------------------- Order cancellation -------------------------- */

  document.querySelectorAll('.js-cancel-order').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Cancel this order? Stock will be restored.')) return;
      button.disabled = true;
      try {
        await window.app.api(`/api/orders/${button.dataset.orderId}/cancel`, { method: 'POST' });
        window.app.showToast('Order cancelled', 'success');
        setTimeout(() => window.location.reload(), 600);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });
})();
