/* ShopSphere - shared client-side helpers */

(function () {
  'use strict';

  /* Current year in the footer */
  document.querySelectorAll('[data-current-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* ------------------- Navbar search suggestions ------------------------- */

  function initSearchSuggestions() {
    const input = document.getElementById('navbar-search');
    const panel = document.getElementById('search-suggest');
    if (!input || !panel) return;

    let debounceTimer = null;

    const hide = () => {
      panel.classList.add('d-none');
      panel.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
    };

    const render = (suggestions) => {
      panel.innerHTML = '';
      if (!suggestions.length) { hide(); return; }

      suggestions.forEach((item) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `/products/${item.slug}`;
        link.textContent = item.name;
        li.appendChild(link);
        panel.appendChild(li);
      });
      panel.classList.remove('d-none');
      input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const term = input.value.trim();
      if (term.length < 2) { hide(); return; }

      debounceTimer = setTimeout(async () => {
        try {
          const result = await window.app.api(`/api/products/suggest?q=${encodeURIComponent(term)}`);
          render(result.data.suggestions);
        } catch (_error) { hide(); }
      }, 250);
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#navbar-search') && !event.target.closest('#search-suggest')) hide();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hide();
    });
  }

  /**
   * Toast notification helper.
   * Usage: window.app.showToast('Added to cart', 'success')
   * Wired to real cart/wishlist actions from Phase 5.
   */
  window.app = window.app || {};

  window.app.showToast = function showToast(message, variant) {
    const container = document.getElementById('flash-container');
    if (!container || typeof bootstrap === 'undefined') return;

    const level = variant || 'info';
    const icons = {
      success: 'bi-check-circle-fill',
      danger: 'bi-exclamation-circle-fill',
      info: 'bi-info-circle-fill',
    };

    const element = document.createElement('div');
    element.className = `toast align-items-center text-white bg-${level} border-0`;
    element.setAttribute('role', 'status');
    element.innerHTML =
      '<div class="d-flex">' +
      `<div class="toast-body"><i class="bi ${icons[level] || icons.info} me-2"></i>` +
      document.createTextNode(message).textContent +
      '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      '</div>';

    container.appendChild(element);
    const toast = new bootstrap.Toast(element, { delay: 3500 });
    toast.show();
    element.addEventListener('hidden.bs.toast', () => element.remove());
  };

  initSearchSuggestions();

  /* ------------------- Navbar badge helpers ------------------------------ */

  window.app.updateBadge = function updateBadge(name, count) {
    const badge = document.querySelector(`[data-badge="${name}"]`);
    if (!badge) return;
    badge.textContent = String(count);
    badge.classList.toggle('d-none', !count);
  };

  function redirectToLogin() {
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/auth/login?redirect=${redirect}`;
  }

  /* -------------------- Shared cart / wishlist actions ------------------- */
  /* Used by catalog cards, product detail and wishlist pages.               */

  window.app.addToCart = async function addToCart(productId, quantity = 1) {
    try {
      const result = await window.app.api('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      });
      window.app.updateBadge('cart', result.data.cart.itemCount);
      window.app.showToast('Added to cart', 'success');
      return true;
    } catch (error) {
      if (error.status === 401) { redirectToLogin(); return false; }
      window.app.showToast(error.message, 'danger');
      return false;
    }
  };

  window.app.addToWishlist = async function addToWishlist(productId) {
    try {
      const result = await window.app.api('/api/wishlist', {
        method: 'POST',
        body: JSON.stringify({ productId }),
      });
      window.app.updateBadge('wishlist', result.data.wishlist.products.length);
      window.app.showToast('Saved to wishlist', 'success');
      return true;
    } catch (error) {
      if (error.status === 401) { redirectToLogin(); return false; }
      window.app.showToast(error.message, 'danger');
      return false;
    }
  };

  /* ------------------------------ Newsletter ------------------------------ */

  document.querySelectorAll('form.js-newsletter').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const button = form.querySelector('.js-newsletter-submit');
      const feedback = form.querySelector('[data-newsletter-feedback]');
      const email = form.email.value.trim();

      button.disabled = true;
      try {
        const result = await window.app.api('/api/newsletter', {
          method: 'POST',
          body: JSON.stringify({ email, source: form.dataset.source || 'footer' }),
        });
        form.reset();
        if (feedback) {
          feedback.textContent = result.message;
          feedback.className = 'small mb-0 mt-2 text-success';
        } else {
          window.app.showToast(result.message, 'success');
        }
      } catch (error) {
        if (feedback) {
          feedback.textContent = error.message;
          feedback.className = 'small mb-0 mt-2 text-danger';
        } else {
          window.app.showToast(error.message, 'danger');
        }
      } finally {
        button.disabled = false;
      }
    });
  });

  /**
   * JSON fetch wrapper used by all client modules.
   * Centralizes envelope parsing; thrown errors carry .status and .payload
   * so callers can map server-side field errors onto inputs.
   */
  window.app.api = async function api(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        credentials: 'same-origin',
        ...options,
      });
    } catch (networkError) {
      throw new Error('Network error - please check your connection.');
    }

    const payload = await response.json().catch(() => null);
    const succeeded = response.ok && payload && payload.success === true;

    if (!succeeded) {
      const error = new Error(
        (payload && payload.message) || `Request failed (${response.status})`,
      );
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  };
})();
