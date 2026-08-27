/* ShopSphere - shared admin console behaviors.
   Every mutation goes through the JSON API; success reloads so the
   server-rendered tables always reflect database state. */

(function () {
  'use strict';

  function confirmMessage(button, fallback) {
    const raw = button.dataset.confirm || fallback;
    // dataset values arrive HTML-decoded; strip wrapping quotes if present
    return window.confirm(raw.replace(/^"(.*)"$/, '$1'));
  }

  /* --------------------------- Delete row buttons -------------------------- */

  document.querySelectorAll('.js-delete-row').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirmMessage(button, 'Delete this item permanently?')) return;
      button.disabled = true;
      try {
        await window.app.api(button.dataset.endpoint, { method: 'DELETE' });
        window.app.showToast('Deleted', 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* ------------------------- Toggle switches (PUT) ------------------------- */

  document.querySelectorAll('.js-toggle-field').forEach((toggle) => {
    toggle.addEventListener('change', async () => {
      const field = toggle.dataset.field;
      toggle.disabled = true;
      try {
        await window.app.api(toggle.dataset.endpoint, {
          method: 'PUT',
          body: JSON.stringify({ [field]: toggle.checked }),
        });
        window.app.showToast('Saved', 'success');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        toggle.checked = !toggle.checked;
        toggle.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* ------------------------ Taxonomy rename (PUT) -------------------------- */

  document.querySelectorAll('.js-save-rename').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const name = row.querySelector('.js-rename-input').value.trim();
      if (name.length < 2) {
        window.app.showToast('Name must be at least 2 characters.', 'info');
        return;
      }
      button.disabled = true;
      try {
        await window.app.api(button.dataset.endpoint, {
          method: 'PUT',
          body: JSON.stringify({ name }),
        });
        window.app.showToast('Renamed', 'success');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* ---------------------- Inventory quick stock set ------------------------ */

  document.querySelectorAll('.js-stock-save').forEach((button) => {
    button.addEventListener('click', async () => {
      const input = button.parentElement.querySelector('.js-stock-input');
      const stock = Number.parseInt(input.value, 10);
      if (Number.isNaN(stock) || stock < 0) {
        window.app.showToast('Enter a valid stock quantity.', 'info');
        return;
      }
      button.disabled = true;
      try {
        await window.app.api(button.dataset.endpoint, {
          method: 'PUT',
          body: JSON.stringify({ stock }),
        });
        window.app.showToast('Stock updated', 'success');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* -------------------- Generic form submitter (POST/PUT) ------------------ */

  // Image upload on the product form: uploads immediately, fills the URL field
  const imageFileInput = document.getElementById('pf-image-file');
  if (imageFileInput) {
    imageFileInput.addEventListener('change', async () => {
      const file = imageFileInput.files[0];
      if (!file) return;

      const status = document.querySelector('.js-upload-status');
      const urlInput = document.getElementById('pf-image');
      const preview = document.getElementById('pf-image-preview');
      status.textContent = 'Uploading...';

      try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/uploads/image', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        });
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Upload failed');
        }

        urlInput.value = payload.data.url;
        preview.src = payload.data.url;
        status.textContent = 'Uploaded!';
        window.app.showToast('Image uploaded', 'success');
      } catch (error) {
        status.textContent = '';
        window.app.showToast(error.message, 'danger');
      } finally {
        imageFileInput.value = '';
      }
    });
  }

  document.querySelectorAll('form[data-endpoint]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const submitButton = form.querySelector('.js-submit-form');
      submitButton.disabled = true;

      // Build payload from named fields
      const payload = {};
      new FormData(form).forEach((value, key) => { payload[key] = value; });

      // Product Form Specific Handlers
      if (form.id === 'product-form') {
        const activeSwitch = form.querySelector('#pf-active');
        const featuredSwitch = form.querySelector('#pf-featured');
        if (activeSwitch) payload.isActive = activeSwitch.checked;
        if (featuredSwitch) payload.isFeatured = featuredSwitch.checked;

        if (typeof payload.images === 'string') {
          payload.images = payload.images.trim() ? [payload.images.trim()] : [];
        } else if (!payload.images) {
          payload.images = [];
        }
      }

      // Type coercion for known numeric/optional fields
      ['price', 'discountPrice', 'minimumAmount', 'maximumDiscount', 'discountValue', 'shippingFlatRate', 'shippingFreeThreshold']
        .forEach((key) => {
          if (payload[key] === '' || payload[key] === undefined) {
            if (['discountPrice', 'maximumDiscount', 'shippingFlatRate', 'shippingFreeThreshold'].includes(key)) payload[key] = null;
            else delete payload[key];
          } else {
            payload[key] = Number(payload[key]);
          }
        });
      ['stock', 'usageLimit', 'lowStockThreshold'].forEach((key) => {
        if (payload[key] === '' || payload[key] === undefined) {
          if (key === 'lowStockThreshold') payload[key] = null;
          else delete payload[key];
        } else {
          payload[key] = Number.parseInt(payload[key], 10);
        }
      });
      if (payload.expirationDate === '') payload.expirationDate = null;
      if (form.id === 'coupon-form' && payload.code) payload.code = String(payload.code).toUpperCase();

      try {
        await window.app.api(form.dataset.endpoint, {
          method: form.dataset.method || 'POST',
          body: JSON.stringify(payload),
        });
        window.app.showToast('Saved', 'success');
        window.location.href = form.dataset.redirect || window.location.pathname;
      } catch (error) {
        submitButton.disabled = false;
        const fieldErrors = (error.payload && error.payload.errors) || [];
        const detail = fieldErrors.map((e2) => e2.message).join(' ');
        window.app.showToast(detail ? `${error.message}: ${detail}` : error.message, 'danger');
      }
    });
  });

  /* ----------------------- Order lifecycle console -------------------------- */

  document.querySelectorAll('.js-save-status').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      if (!row) return;
      const select = row.querySelector('.js-status-select');
      if (!select.value) {
        window.app.showToast('Pick a new status first.', 'info');
        return;
      }

      button.disabled = true;
      try {
        const result = await window.app.api(`/api/admin/orders/${button.dataset.orderId}/status`, {
          method: 'PUT',
          body: JSON.stringify({
            status: select.value,
            trackingNumber: row.querySelector('.js-tracking-input').value.trim(),
          }),
        });
        window.app.showToast(result.message, 'success');
        setTimeout(() => window.location.reload(), 600);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* ---------------------------- Review moderation --------------------------- */

  document.querySelectorAll('.js-review-moderate').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.app.api(button.dataset.endpoint, { method: 'PUT' });
        window.app.showToast('Review updated', 'success');
        setTimeout(() => window.location.reload(), 400);
      } catch (error) {
        button.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
    });
  });

  /* -------------------------------- Users ----------------------------------- */

  document.querySelectorAll('.js-role-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const previousValue = select.dataset.previous || select.value;
      if (!window.confirm(`Change role to ${select.value}?`)) {
        select.value = previousValue;
        return;
      }
      select.disabled = true;
      try {
        await window.app.api(select.dataset.endpoint, {
          method: 'PUT',
          body: JSON.stringify({ role: select.value }),
        });
        window.app.showToast('Role updated', 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        select.value = previousValue;
        select.disabled = false;
        window.app.showToast(error.message, 'danger');
      }
      select.dataset.previous = select.value;
    });
    select.dataset.previous = select.value;
  });

  /* ---------------------------- AI Copywriting ------------------------------ */

  const aiGenBtn = document.getElementById('btn-ai-generate-desc');
  if (aiGenBtn) {
    aiGenBtn.addEventListener('click', async () => {
      const nameInput = document.getElementById('pf-name');
      const descInput = document.getElementById('pf-description');
      const catSelect = document.getElementById('pf-category');
      
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        window.app.showToast('Please enter a product name first.', 'info');
        if (nameInput) nameInput.focus();
        return;
      }

      const categoryName = catSelect && catSelect.selectedIndex > 0 ? catSelect.options[catSelect.selectedIndex].text : '';
      aiGenBtn.disabled = true;
      aiGenBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';

      try {
        const result = await window.app.api('/api/ai/generate-product', {
          method: 'POST',
          body: JSON.stringify({ name, categoryName, keywords: name }),
        });

        if (result && result.data && result.data.copy) {
          descInput.value = result.data.copy.description;
          window.app.showToast('Product description generated with AI!', 'success');
        }
      } catch (err) {
        window.app.showToast(err.message || 'AI generation failed', 'danger');
      } finally {
        aiGenBtn.disabled = false;
        aiGenBtn.innerHTML = '<i class="bi bi-stars"></i> Generate with AI';
      }
    });
  }

  /* ---------------------- Global Admin Search (Ctrl+K) --------------------- */
  const searchInput = document.getElementById('admin-global-search-input');
  const searchResults = document.getElementById('admin-global-search-results');
  const searchModalEl = document.getElementById('adminGlobalSearchModal');

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (searchModalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(searchModalEl);
        modal.show();
      }
    }
  });

  if (searchModalEl) {
    searchModalEl.addEventListener('shown.bs.modal', () => {
      if (searchInput) searchInput.focus();
    });
  }

  let searchTimeout = null;
  if (searchInput && searchResults) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      if (query.length < 2) {
        searchResults.innerHTML = '<div class="text-center py-4 text-muted"><small>Type at least 2 characters to search.</small></div>';
        return;
      }

      searchTimeout = setTimeout(async () => {
        searchResults.innerHTML = '<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary"></span> Searching...</div>';
        try {
          const res = await window.app.api(`/api/admin/global-search?q=${encodeURIComponent(query)}`);
          const { products = [], orders = [], users = [], categories = [], coupons = [] } = res.data || {};

          if (!products.length && !orders.length && !users.length && !categories.length && !coupons.length) {
            searchResults.innerHTML = '<div class="text-center py-4 text-muted">No results found for &ldquo;' + query + '&rdquo;</div>';
            return;
          }

          let html = '';
          if (products.length) {
            html += '<h6 class="text-uppercase text-muted fw-bold small mb-2 mt-1">Products</h6><ul class="list-group list-group-flush mb-3">';
            products.forEach((p) => {
              html += `<li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-2"><a href="/products/${p.slug}" class="text-decoration-none fw-semibold text-reset">${p.name}</a><span class="badge bg-primary-subtle text-primary-emphasis">$${p.price.toFixed(2)}</span></li>`;
            });
            html += '</ul>';
          }

          if (orders.length) {
            html += '<h6 class="text-uppercase text-muted fw-bold small mb-2">Orders</h6><ul class="list-group list-group-flush mb-3">';
            orders.forEach((o) => {
              html += `<li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-2"><a href="/orders/${o._id}" class="text-decoration-none fw-semibold text-reset">${o.orderNumber}</a><span class="badge bg-secondary-subtle text-secondary-emphasis">${o.orderStatus} · $${o.total.toFixed(2)}</span></li>`;
            });
            html += '</ul>';
          }

          if (users.length) {
            html += '<h6 class="text-uppercase text-muted fw-bold small mb-2">Users</h6><ul class="list-group list-group-flush mb-3">';
            users.forEach((u) => {
              html += `<li class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-2"><span>${u.firstName} ${u.lastName} <small class="text-muted">(${u.email})</small></span><span class="badge bg-dark">${u.role}</span></li>`;
            });
            html += '</ul>';
          }

          searchResults.innerHTML = html;
        } catch (err) {
          searchResults.innerHTML = `<div class="text-danger small py-2">${err.message || 'Search failed'}</div>`;
        }
      }, 250);
    });
  }

  /* ---------------------- AI Executive Copilot ---------------------------- */
  const copilotInput = document.getElementById('copilot-input');
  const copilotSendBtn = document.getElementById('btn-copilot-send');
  const copilotOutput = document.getElementById('copilot-output');

  const executeCopilot = async (promptText) => {
    if (!promptText || !copilotOutput) return;
    copilotOutput.innerHTML += `\n\n<strong class="text-primary">👤 Admin :</strong> ${promptText}\n<em class="text-muted">⏳ Analyse en cours...</em>`;
    copilotOutput.scrollTop = copilotOutput.scrollHeight;
    if (copilotSendBtn) copilotSendBtn.disabled = true;

    try {
      const res = await window.app.api('/api/ai/admin-copilot', {
        method: 'POST',
        body: JSON.stringify({ prompt: promptText }),
      });

      const reply = res?.data?.reply || 'Analyse terminée.';
      copilotOutput.innerHTML = copilotOutput.innerHTML.replace('<em class="text-muted">⏳ Analyse en cours...</em>', `\n<strong class="text-success">🤖 Copilote IA :</strong>\n${reply}`);
      copilotOutput.scrollTop = copilotOutput.scrollHeight;
    } catch (err) {
      copilotOutput.innerHTML = copilotOutput.innerHTML.replace('<em class="text-muted">⏳ Analyse en cours...</em>', `\n<span class="text-danger">❌ Erreur : ${err.message}</span>`);
    } finally {
      if (copilotSendBtn) copilotSendBtn.disabled = false;
      if (copilotInput) copilotInput.value = '';
    }
  };

  if (copilotSendBtn && copilotInput) {
    copilotSendBtn.addEventListener('click', () => {
      const text = copilotInput.value.trim();
      if (text) executeCopilot(text);
    });

    copilotInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = copilotInput.value.trim();
        if (text) executeCopilot(text);
      }
    });
  }

  document.querySelectorAll('.js-copilot-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) executeCopilot(prompt);
    });
  });
})();
