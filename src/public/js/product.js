/* ShopSphere - product detail page */

(function () {
  'use strict';

  /* ------------------------------- Gallery -------------------------------- */

  const mainImage = document.getElementById('gallery-main');
  if (mainImage) {
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

  /* --------------------- Add to cart / wishlist --------------------------- */
  /* Shared helpers live in main.js (badges, toasts, login redirects).         */

  document.querySelectorAll('.js-add-to-cart').forEach((button) => {
    button.addEventListener('click', () => {
      const quantity = qtyInput ? Number.parseInt(qtyInput.value, 10) || 1 : 1;
      window.app.addToCart(button.dataset.productId, quantity);
    });
  });

  document.querySelectorAll('.js-add-to-wishlist').forEach((button) => {
    button.addEventListener('click', () => {
      window.app.addToWishlist(button.dataset.productId);
    });
  });

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
})();
