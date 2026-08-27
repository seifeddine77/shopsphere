/* ShopSphere - product detail page */

(function () {
  'use strict';

  /* ------------------------------- Gallery & Zoom ------------------------- */

  const mainImage = document.getElementById('gallery-main');
  const zoomContainer = document.querySelector('.gallery-zoom-container');

  if (mainImage && zoomContainer) {
    zoomContainer.addEventListener('mousemove', (e) => {
      const rect = zoomContainer.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      mainImage.style.transformOrigin = `${x}% ${y}%`;
      mainImage.style.transform = 'scale(1.75)';
    });

    zoomContainer.addEventListener('mouseleave', () => {
      mainImage.style.transform = 'scale(1)';
      mainImage.style.transformOrigin = 'center center';
    });

    document.querySelectorAll('.gallery-thumb').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        mainImage.src = thumb.dataset.src;
        document.querySelectorAll('.gallery-thumb.active').forEach((el) => el.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }

  /* ---------------------------- Quantity stepper --------------------------- */

  const stepper = document.querySelector('.qty-stepper');
  const qtyInput = document.querySelector('.js-qty');
  if (stepper && qtyInput) {
    const stock = Number.parseInt(stepper.dataset.stock, 10) || 1;

    const clamp = () => {
      let value = Number.parseInt(qtyInput.value, 10);
      if (Number.isNaN(value) || value < 1) value = 1;
      if (value > stock) value = stock;
      qtyInput.value = value;
    };

    stepper.querySelector('.js-qty-decrease')?.addEventListener('click', () => {
      qtyInput.value = Math.max(Number.parseInt(qtyInput.value, 10) - 1, 1);
    });
    stepper.querySelector('.js-qty-increase')?.addEventListener('click', () => {
      qtyInput.value = Math.min(Number.parseInt(qtyInput.value, 10) + 1, stock);
    });
    qtyInput.addEventListener('change', clamp);
  }

  /* ------------------------------- Reviews -------------------------------- */

  const reviewForm = document.getElementById('review-form');
  if (reviewForm) {
    const ratingInput = document.getElementById('review-rating');
    const commentInput = document.getElementById('review-comment');
    const submitButton = reviewForm.querySelector('.js-review-submit');
    const cancelButton = reviewForm.querySelector('.js-review-cancel-edit');
    const formTitle = reviewForm.querySelector('.js-form-title');

    let editingId = null;

    function paintStars(value) {
      reviewForm.querySelectorAll('.star-btn i').forEach((icon) => {
        const button = icon.closest('.star-btn');
        const active = Number(button.dataset.value) <= Number(value || 0);
        icon.classList.toggle('bi-star-fill', active);
        icon.classList.toggle('bi-star', !active);
        button.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }

    reviewForm.querySelectorAll('.star-btn').forEach((button) => {
      button.addEventListener('click', () => {
        ratingInput.value = button.dataset.value;
        paintStars(button.dataset.value);
      });
    });

    function startEdit(id, rating, comment) {
      editingId = id;
      ratingInput.value = String(rating);
      commentInput.value = comment;
      paintStars(rating);
      formTitle.textContent = 'Edit your review';
      submitButton.textContent = 'Save changes';
      cancelButton.classList.remove('d-none');
      reviewForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function resetForm() {
      editingId = null;
      ratingInput.value = '';
      commentInput.value = '';
      paintStars(0);
      formTitle.textContent = 'Write your review';
      submitButton.textContent = 'Submit review';
      cancelButton.classList.add('d-none');
    }

    cancelButton.addEventListener('click', resetForm);

    // Prefill when the page loads with an existing pending/own review? No -
    // the edit buttons carry their data and call startEdit on demand.
    document.querySelectorAll('.js-review-edit').forEach((button) => {
      button.addEventListener('click', () => {
        startEdit(button.dataset.reviewId, button.dataset.rating, button.dataset.comment);
      });
    });

    document.querySelectorAll('.js-review-delete').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete your review?')) return;
        try {
          await window.app.api(`/api/reviews/${button.dataset.reviewId}`, { method: 'DELETE' });
          window.app.showToast('Review deleted', 'success');
          setTimeout(() => window.location.reload(), 600);
        } catch (error) {
          window.app.showToast(error.message, 'danger');
        }
      });
    });

    reviewForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!ratingInput.value) {
        window.app.showToast('Please choose a star rating.', 'info');
        return;
      }
      if (commentInput.value.trim().length < 10) {
        window.app.showToast('Please write at least 10 characters.', 'info');
        return;
      }

      submitButton.disabled = true;
      try {
        const payload = JSON.stringify({
          rating: Number(ratingInput.value),
          comment: commentInput.value.trim(),
        });

        const result = editingId
          ? await window.app.api(`/api/reviews/${editingId}`, { method: 'PUT', body: payload })
          : await window.app.api(`/api/products/${reviewForm.dataset.slug}/reviews`, {
              method: 'POST',
              body: payload,
            });

        window.app.showToast(result.message, 'success');
        setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        submitButton.disabled = false;
        if (error.status === 401) {
          window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        window.app.showToast(error.message, 'danger');
      }
    });
  }

  /* -------------------------- Helpful review vote -------------------------- */
  document.querySelectorAll('.js-helpful-vote').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.dataset.reviewId;
      btn.disabled = true;
      try {
        const res = await window.app.api(`/api/reviews/${reviewId}/helpful`, { method: 'POST' });
        const countEl = btn.querySelector('.helpful-count');
        if (countEl && res.data) countEl.textContent = String(res.data.helpfulVotes);
        btn.classList.replace('btn-outline-secondary', 'btn-primary');
        window.app.showToast('Thank you for your feedback!', 'success');
      } catch (err) {
        btn.disabled = false;
        window.app.showToast(err.message, 'danger');
      }
    });
  });

  /* ------------------------- Stock alert subscriber ------------------------ */
  document.querySelectorAll('.js-stock-alert-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const productId = form.dataset.productId;
      const emailInput = form.querySelector('.js-stock-alert-email');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!email) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await window.app.api(`/api/products/${productId}/stock-alert`, {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        window.app.showToast(res.message || 'Subscribed to stock alert!', 'success');
        form.innerHTML = '<div class="alert alert-success py-1 px-2 mb-0 small"><i class="bi bi-check-circle me-1"></i>You will be notified when restocked!</div>';
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
        window.app.showToast(err.message, 'danger');
      }
    });
  });

  /* -------------------------- Copy Link Share ----------------------------- */
  document.querySelectorAll('.js-copy-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        window.app.showToast('Product link copied to clipboard!', 'success');
      } catch (_e) {
        window.app.showToast('Could not copy link.', 'info');
      }
    });
  });

  /* ---------------------- Mobile Sticky CTA Observer ----------------------- */
  const stickyBar = document.getElementById('mobile-sticky-bar');
  const purchaseRow = document.querySelector('.purchase-row');

  if (stickyBar && purchaseRow && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            stickyBar.classList.remove('d-none');
          } else {
            stickyBar.classList.add('d-none');
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(purchaseRow);
  }

  /* ------------------- Frequently Bought Together Bundle ------------------ */
  const bundleBtn = document.querySelector('.js-add-bundle');
  if (bundleBtn) {
    bundleBtn.addEventListener('click', async () => {
      const prod1 = bundleBtn.dataset.prod1;
      const prod2 = bundleBtn.dataset.prod2;
      bundleBtn.disabled = true;
      bundleBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Adding bundle...';
      try {
        await Promise.all([
          window.app.api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: prod1, quantity: 1 }) }),
          window.app.api('/api/cart', { method: 'POST', body: JSON.stringify({ productId: prod2, quantity: 1 }) }),
        ]);
        window.app.showToast('Bundle added to cart with 10% savings!', 'success');
        if (typeof window.app.openCartDrawer === 'function') {
          window.app.openCartDrawer();
        }
      } catch (err) {
        window.app.showToast(err.message || 'Failed to add bundle', 'danger');
      } finally {
        bundleBtn.disabled = false;
        bundleBtn.innerHTML = '<i class="bi bi-bag-plus-fill me-1"></i> Add Both to Cart';
      }
    });
  }
})();
