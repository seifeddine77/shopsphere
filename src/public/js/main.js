/* ShopSphere - shared client-side helpers */

(function () {
  'use strict';

  /* Current year in the footer */
  document.querySelectorAll('[data-current-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* ------------------- Navbar search suggestions & Autocomplete --------- */

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

    const getRecentSearches = () => {
      try {
        return JSON.parse(localStorage.getItem('shopsphere_recent_searches') || '[]');
      } catch (_e) {
        return [];
      }
    };

    const saveSearch = (query) => {
      const q = (query || '').trim();
      if (!q) return;
      const recent = getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase());
      recent.unshift(q);
      localStorage.setItem('shopsphere_recent_searches', JSON.stringify(recent.slice(0, 5)));
    };

    const renderRecent = () => {
      const recent = getRecentSearches();
      if (!recent.length) { hide(); return; }

      panel.innerHTML = `
        <li class="p-2 border-bottom text-muted small fw-semibold bg-body-tertiary d-flex justify-content-between align-items-center">
          <span><i class="bi bi-clock-history me-1"></i>Recent Searches</span>
          <button type="button" class="btn btn-sm btn-link p-0 text-danger text-decoration-none js-clear-recent" style="font-size: 0.75rem;">Clear</button>
        </li>
        ${recent.map((s) => `
          <li>
            <a href="/products?q=${encodeURIComponent(s)}" class="search-suggestion-item">
              <i class="bi bi-search text-muted me-2"></i>
              <span class="flex-grow-1">${s}</span>
            </a>
          </li>
        `).join('')}
      `;
      panel.classList.remove('d-none');
      input.setAttribute('aria-expanded', 'true');
    };

    const renderSuggestions = (suggestions, term) => {
      panel.innerHTML = '';
      if (!suggestions.length) {
        panel.innerHTML = `
          <li class="p-3 text-center text-muted small">
            <p class="mb-1 fw-semibold">No direct matches for "${term}"</p>
            <a href="/products?q=${encodeURIComponent(term)}" class="btn btn-sm btn-outline-primary mt-1">Search catalog for "${term}" &rarr;</a>
          </li>
        `;
        panel.classList.remove('d-none');
        input.setAttribute('aria-expanded', 'true');
        return;
      }

      panel.innerHTML = `
        <li class="p-2 border-bottom text-muted small fw-semibold bg-body-tertiary">
          <span><i class="bi bi-stars text-primary me-1"></i>Products & Suggestions</span>
        </li>
        ${suggestions.map((item) => `
          <li>
            <a href="/products/${item.slug}" class="search-suggestion-item">
              <img src="${item.image || '/images/placeholder.svg'}" alt="" class="search-suggestion-thumb">
              <div class="flex-grow-1 min-w-0">
                <div class="fw-semibold small text-truncate">${item.name}</div>
                <div class="text-primary fw-bold small">$${Number(item.effectivePrice || item.price || 0).toFixed(2)}</div>
              </div>
            </a>
          </li>
        `).join('')}
        <li class="p-2 border-top text-center bg-body-tertiary">
          <a href="/products?q=${encodeURIComponent(term)}" class="small fw-semibold text-primary text-decoration-none">
            View all results for "${term}" &rarr;
          </a>
        </li>
      `;
      panel.classList.remove('d-none');
      input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('focus', () => {
      if (!input.value.trim()) {
        renderRecent();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const term = input.value.trim();
      if (term.length < 2) {
        if (!term) renderRecent();
        else hide();
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const result = await window.app.api(`/api/products/suggest?q=${encodeURIComponent(term)}`);
          if (result && result.data) {
            renderSuggestions(result.data.suggestions || [], term);
          }
        } catch (_error) { hide(); }
      }, 200);
    });

    input.closest('form')?.addEventListener('submit', () => {
      saveSearch(input.value);
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.js-clear-recent')) {
        localStorage.removeItem('shopsphere_recent_searches');
        hide();
        return;
      }
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

  /* ---------------------- Theme Switcher --------------------------------- */
  function initThemeSwitcher() {
    const toggleBtns = document.querySelectorAll('.js-theme-toggle');
    if (!toggleBtns.length) return;

    const getPreferredTheme = () => {
      const stored = localStorage.getItem('shopsphere-theme');
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const setTheme = (theme) => {
      document.documentElement.setAttribute('data-bs-theme', theme);
      localStorage.setItem('shopsphere-theme', theme);
      updateIcons(theme);
    };

    const updateIcons = (theme) => {
      document.querySelectorAll('.theme-icon-light').forEach((icon) => {
        icon.classList.toggle('d-none', theme === 'dark');
      });
      document.querySelectorAll('.theme-icon-dark').forEach((icon) => {
        icon.classList.toggle('d-none', theme !== 'dark');
      });
    };

    const currentTheme = document.documentElement.getAttribute('data-bs-theme') || getPreferredTheme();
    updateIcons(currentTheme);

    toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const active = document.documentElement.getAttribute('data-bs-theme') || 'light';
        const next = active === 'dark' ? 'light' : 'dark';
        setTheme(next);
        window.app.showToast(`Switched to ${next} mode`, 'info');
      });
    });
  }

  initSearchSuggestions();
  initThemeSwitcher();

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

  /* -------------------- Cart Drawer Logic -------------------------------- */
  window.app.renderCartDrawer = function renderCartDrawer(cart) {
    const container = document.getElementById('cart-drawer-items');
    const emptyState = document.getElementById('cart-drawer-empty');
    const footer = document.getElementById('cart-drawer-footer');
    const subtotalEl = document.getElementById('cart-drawer-subtotal');
    const countEl = document.getElementById('cart-drawer-count');

    if (!container) return;

    const items = (cart && cart.items) || [];
    const count = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    if (countEl) countEl.textContent = String(count);

    if (items.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      if (footer) footer.classList.add('d-none');
      return;
    }

    const subtotal = Number(cart.subtotal || 0);
    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

    // Free shipping calculation
    const freeShippingBox = document.getElementById('cart-drawer-free-shipping');
    const freeShippingLabel = document.getElementById('cart-drawer-free-shipping-label');
    const freeShippingBar = document.getElementById('cart-drawer-free-shipping-bar');
    const freeShippingPercent = document.getElementById('cart-drawer-free-shipping-percent');

    if (freeShippingBox && freeShippingBar && freeShippingLabel && freeShippingPercent) {
      const threshold = 100;
      const diff = Math.max(0, threshold - subtotal);
      const percent = Math.min(100, Math.round((subtotal / threshold) * 100));

      freeShippingBox.classList.remove('d-none');
      freeShippingBar.style.width = `${percent}%`;
      freeShippingPercent.textContent = `${percent}%`;

      if (diff <= 0) {
        freeShippingLabel.innerHTML = '<i class="bi bi-gift-fill text-success me-1"></i>Free Express Shipping unlocked!';
      } else {
        freeShippingLabel.innerHTML = `<i class="bi bi-truck text-primary me-1"></i>Add $${diff.toFixed(2)} for Free Shipping`;
      }
    }

    container.innerHTML = items.map((item) => `
      <div class="d-flex align-items-center gap-3 py-3 border-bottom cart-drawer-item" data-item-id="${item._id}">
        <img src="${(item.product && item.product.images && item.product.images[0]) || '/images/placeholder.svg'}"
             alt="${item.name}" class="rounded border p-1" style="width: 60px; height: 60px; object-fit: contain;">
        <div class="flex-grow-1 min-w-0">
          <h6 class="mb-0 small fw-semibold text-truncate"><a href="/products/${item.slug}" class="text-reset text-decoration-none">${item.name}</a></h6>
          <div class="text-muted small mt-1">$${Number(item.unitPrice).toFixed(2)} &times; ${item.quantity} = <strong class="text-primary">$${Number(item.lineTotal || (item.unitPrice * item.quantity)).toFixed(2)}</strong></div>
          <div class="d-flex align-items-center gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 js-drawer-qty" data-action="dec" data-id="${item._id}">-</button>
            <span class="small fw-bold px-1">${item.quantity}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2 js-drawer-qty" data-action="inc" data-id="${item._id}">+</button>
            <button type="button" class="btn btn-sm btn-link text-danger p-0 ms-auto js-drawer-remove" data-id="${item._id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  };

  window.app.refreshCartDrawer = async function refreshCartDrawer() {
    try {
      const result = await window.app.api('/api/cart');
      if (result && result.data && result.data.cart) {
        window.app.renderCartDrawer(result.data.cart);
        window.app.updateBadge('cart', result.data.cart.itemCount);
      }
    } catch (_e) {}
  };

  window.app.openCartDrawer = function openCartDrawer() {
    const drawerEl = document.getElementById('cartDrawerOffcanvas');
    if (drawerEl && window.bootstrap && window.bootstrap.Offcanvas) {
      const offcanvas = window.bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
      offcanvas.show();
    }
  };

  /* -------------------- Shared cart / wishlist actions ------------------- */
  /* Used by catalog cards, product detail and wishlist pages.               */

  window.app.addToCart = async function addToCart(productId, quantity = 1) {
    try {
      const result = await window.app.api('/api/cart', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      });
      window.app.updateBadge('cart', result.data.cart.itemCount);
      window.app.renderCartDrawer(result.data.cart);
      window.app.showToast('Added to cart', 'success');
      window.app.openCartDrawer();
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

  /* ---------------- Global Add-to-Cart / Wishlist Listener --------------- */
  document.addEventListener('click', (event) => {
    const addCart = event.target.closest('.js-add-to-cart');
    if (addCart && !addCart.disabled) {
      const qtyInput = document.querySelector('.js-qty');
      const quantity = qtyInput ? Number.parseInt(qtyInput.value, 10) || 1 : 1;
      window.app.addToCart(addCart.dataset.productId, quantity);
      return;
    }
    const addWish = event.target.closest('.js-add-to-wishlist');
    if (addWish && !addWish.disabled) {
      window.app.addToWishlist(addWish.dataset.productId);
      return;
    }

    /* Cart drawer quantity adjustment */
    const drawerQty = event.target.closest('.js-drawer-qty');
    if (drawerQty) {
      const itemId = drawerQty.dataset.id;
      const action = drawerQty.dataset.action;
      const row = drawerQty.closest('.cart-drawer-item');
      const currentQty = Number.parseInt(row.querySelector('span.fw-bold').textContent, 10) || 1;
      const nextQty = action === 'inc' ? currentQty + 1 : currentQty - 1;

      (async () => {
        try {
          if (nextQty <= 0) {
            const res = await window.app.api(`/api/cart/items/${itemId}`, { method: 'DELETE' });
            window.app.renderCartDrawer(res.data.cart);
            window.app.updateBadge('cart', res.data.cart.itemCount);
          } else {
            const res = await window.app.api(`/api/cart/items/${itemId}`, {
              method: 'PATCH',
              body: JSON.stringify({ quantity: nextQty }),
            });
            window.app.renderCartDrawer(res.data.cart);
            window.app.updateBadge('cart', res.data.cart.itemCount);
          }
        } catch (err) {
          window.app.showToast(err.message, 'danger');
        }
      })();
      return;
    }

    /* Cart drawer item removal */
    const drawerRemove = event.target.closest('.js-drawer-remove');
    if (drawerRemove) {
      const itemId = drawerRemove.dataset.id;
      (async () => {
        try {
          const res = await window.app.api(`/api/cart/items/${itemId}`, { method: 'DELETE' });
          window.app.renderCartDrawer(res.data.cart);
          window.app.updateBadge('cart', res.data.cart.itemCount);
          window.app.showToast('Item removed', 'info');
        } catch (err) {
          window.app.showToast(err.message, 'danger');
        }
      })();
    }
  });

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

  /* ------------------- Recently Viewed Products -------------------------- */
  function initRecentlyViewed() {
    const STORAGE_KEY = 'shopsphere_recent_products';
    const grid = document.getElementById('recently-viewed-grid');
    const section = document.getElementById('recently-viewed-section');
    const clearBtn = document.getElementById('clear-recent-btn');

    const getRecent = () => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      } catch (_e) {
        return [];
      }
    };

    const saveRecent = (list) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 8)));
      } catch (_e) {}
    };

    // If on a product page, record the current product
    const productDetailEl = document.querySelector('[data-product-id][data-product-slug]');
    let currentId = null;
    if (productDetailEl) {
      currentId = productDetailEl.dataset.productId;
      const productData = {
        id: currentId,
        name: productDetailEl.dataset.productName,
        slug: productDetailEl.dataset.productSlug,
        price: productDetailEl.dataset.productPrice,
        image: productDetailEl.dataset.productImage,
      };
      const list = getRecent().filter((item) => item.id !== productData.id);
      list.unshift(productData);
      saveRecent(list);
    }

    if (!grid || !section) return;

    const items = getRecent();
    const filtered = items.filter((p) => p.id !== currentId);

    if (!filtered.length) {
      section.classList.add('d-none');
      return;
    }

    grid.innerHTML = filtered.slice(0, 4).map((p) => `
      <div class="col">
        <div class="card h-100 product-card shadow-sm border-0">
          <a href="/products/${p.slug}" class="text-decoration-none">
            <img src="${p.image || '/images/placeholder.svg'}" class="card-img-top" alt="${p.name}" style="height: 180px; object-fit: contain; padding: 1rem;">
          </a>
          <div class="card-body d-flex flex-column p-3">
            <h6 class="card-title text-truncate mb-1"><a href="/products/${p.slug}" class="text-reset text-decoration-none">${p.name}</a></h6>
            <div class="mt-auto d-flex align-items-center justify-content-between pt-2">
              <span class="fw-bold text-primary">$${Number(p.price).toFixed(2)}</span>
              <button type="button" class="btn btn-sm btn-outline-primary js-quick-add" data-id="${p.id}"><i class="bi bi-cart-plus"></i></button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    section.classList.remove('d-none');

    grid.querySelectorAll('.js-quick-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.app.addToCart(btn.dataset.id, 1);
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        section.classList.add('d-none');
        window.app.showToast('History cleared', 'info');
      });
    }
  }

  /* ------------------- Product Comparison System ------------------------ */
  function initCompare() {
    const COMPARE_KEY = 'shopsphere_compare_items';

    const getCompareList = () => {
      try {
        return JSON.parse(localStorage.getItem(COMPARE_KEY)) || [];
      } catch (_e) {
        return [];
      }
    };

    const updateCompareBadge = () => {
      const list = getCompareList();
      const badge = document.getElementById('compare-count-badge');
      if (badge) {
        badge.textContent = list.length;
        if (list.length > 0) {
          badge.classList.remove('d-none');
        } else {
          badge.classList.add('d-none');
        }
      }

      // Update navbar compare button href
      const navBtn = document.getElementById('nav-compare-btn');
      const compareUrl = list.length > 0 ? `/compare?ids=${list.join(',')}` : '/compare';
      if (navBtn) {
        navBtn.href = compareUrl;
      }

      // Update Floating Dock Drawer
      const dock = document.getElementById('compare-floating-dock');
      const dockCount = document.getElementById('dock-compare-count');
      const dockLink = document.getElementById('dock-compare-link');
      if (dock) {
        if (list.length > 0) {
          dock.classList.remove('d-none');
          if (dockCount) dockCount.textContent = `${list.length}/4`;
          if (dockLink) dockLink.href = compareUrl;
        } else {
          dock.classList.add('d-none');
        }
      }

      // Update button active state on page
      document.querySelectorAll('.js-add-to-compare').forEach((btn) => {
        const id = btn.dataset.productId;
        if (id && list.includes(id)) {
          btn.classList.add('btn-primary', 'text-white');
          btn.classList.remove('btn-outline-secondary');
        } else {
          btn.classList.remove('btn-primary', 'text-white');
          btn.classList.add('btn-outline-secondary');
        }
      window.app.updateCompareBadge = updateCompareBadge;
    };

    const dockClearBtn = document.getElementById('dock-clear-btn');
    if (dockClearBtn) {
      dockClearBtn.addEventListener('click', () => {
        localStorage.removeItem(COMPARE_KEY);
        updateCompareBadge();
        window.app.showToast('Comparison cleared', 'info');
      });
    }

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-add-to-compare');
      if (!btn) return;
      e.preventDefault();

      const id = btn.dataset.productId;
      if (!id) return;

      let list = getCompareList();
      if (list.includes(id)) {
        list = list.filter((item) => item !== id);
        localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
        updateCompareBadge();
        window.app.showToast('Product removed from comparison', 'info');
      } else {
        if (list.length >= 4) {
          window.app.showToast('You can compare up to 4 products at a time.', 'warning');
          return;
        }
        list.push(id);
        localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
        updateCompareBadge();
        window.app.showToast(`Product added to comparison (${list.length}/4).`, 'success');
      }
    });

    updateCompareBadge();
  }

  /* ------------------- 1-Click Order Reorder ---------------------------- */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-reorder-btn');
    if (!btn) return;
    e.preventDefault();

    const orderId = btn.dataset.orderId;
    if (!orderId) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Reordering...';

    try {
      const res = await window.app.api(`/api/orders/${orderId}/reorder`, { method: 'POST' });
      window.app.showToast(res.message || 'Items added back to your cart!', 'success');
      setTimeout(() => {
        window.location.href = '/cart';
      }, 700);
    } catch (err) {
      window.app.showToast(err.message || 'Reorder failed', 'danger');
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  /* ---------------------- Global Logout Handler -------------------------- */
  document.addEventListener('click', async (event) => {
    const logoutBtn = event.target.closest('[data-action="logout"], .js-logout-btn, a[href="/logout"], a[href="/auth/logout"]');
    if (logoutBtn) {
      event.preventDefault();
      try {
        await window.app.api('/api/auth/logout', { method: 'POST' });
      } catch (_e) {}
      window.location.href = '/';
    }
  });

  initRecentlyViewed();
  initCompare();
})();
