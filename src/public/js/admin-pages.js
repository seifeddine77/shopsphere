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
})();
