/* ShopSphere - 3-step checkout wizard.
   Display-only math mirrors the server; the server ALWAYS recomputes
   authoritative totals at order creation. */

(function () {
  'use strict';

  const root = document.getElementById('checkout-root');
  if (!root) return;

  const flatRate = Number.parseFloat(root.dataset.flatRate);
  const freeThreshold = Number.parseFloat(root.dataset.freeThreshold);

  /* ------------------------------- Stepper -------------------------------- */

  function showStep(step) {
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      panel.classList.toggle('d-none', panel.dataset.panel !== String(step));
    });
    document.querySelectorAll('[data-step-indicator]').forEach((indicator) => {
      indicator.classList.toggle('active', Number(indicator.dataset.stepIndicator) === Number(step));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.js-next').forEach((button) => {
    button.addEventListener('click', () => {
      if (Number(button.dataset.goto) === 2 && !collectAddress()) return;
      showStep(button.dataset.goto);
      if (Number(button.dataset.goto) === 3) renderRecap();
    });
  });

  document.querySelectorAll('.js-back').forEach((button) => {
    button.addEventListener('click', () => showStep(button.dataset.goto));
  });

  /* ------------------------------- Address -------------------------------- */

  let address = null;

  function collectAddress() {
    const savedChoice = document.querySelector('input[name="savedAddress"]:checked');
    const form = document.getElementById('address-form');

    // Saved-address mode
    if (savedChoice && savedChoice.value !== '__new__') {
      address = { shippingAddressId: savedChoice.value };
      return true;
    }

    // New-address mode: rely on HTML5 validation
    if (!form.reportValidity()) return false;
    address = { shippingAddress: {} };
    ['fullName', 'phone', 'street', 'city', 'state', 'postalCode', 'country'].forEach((field) => {
      address.shippingAddress[field] = form.elements[field].value.trim();
    });
    address.saveAddress = document.getElementById('save-address').checked;
    return true;
  }

  /* Toggle between saved addresses and the new-address form */
  document.querySelectorAll('input[name="savedAddress"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (form()) form().classList.toggle('d-none', radio.value !== '__new__' || !isCheckedNew());
    });
    function form() { return document.getElementById('address-form'); }
    function isCheckedNew() {
      const current = document.querySelector('input[name="savedAddress"]:checked');
      return current && current.value === '__new__';
    }
  });

  /* ------------------------------- Payment -------------------------------- */

  function paymentMethod() {
    return document.querySelector('input[name="paymentMethod"]:checked').value;
  }

  function collectCard() {
    if (paymentMethod() !== 'CARD') return undefined;
    return {
      number: document.getElementById('card-number').value,
      expiry: document.getElementById('card-expiry').value,
      cvc: document.getElementById('card-cvc').value,
    };
  }

  document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      document.getElementById('card-fields').classList.toggle('d-none', radio.value !== 'CARD' || !radio.checked);
    });
  });

  /* Light input formatting */
  const numberInput = document.getElementById('card-number');
  numberInput?.addEventListener('input', () => {
    numberInput.value = numberInput.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
  });
  const expiryInput = document.getElementById('card-expiry');
  expiryInput?.addEventListener('input', () => {
    let value = expiryInput.value.replace(/\D/g, '').slice(0, 4);
    if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
    expiryInput.value = value;
  });

  /* -------------------------------- Totals -------------------------------- */

  const state = { subtotal: 0, discount: 0, couponCode: null };
  const money = (value) => `$${value.toFixed(2)}`;

  function recomputeTotals() {
    const afterDiscount = Math.max(state.subtotal - state.discount, 0);
    const shipping = afterDiscount >= freeThreshold ? 0 : flatRate;
    const grand = afterDiscount + shipping;

    root.querySelector('[data-total="subtotal"]').textContent = money(state.subtotal);
    const discountRow = root.querySelector('[data-row="discount"]');
    discountRow.classList.toggle('d-none', !(state.discount > 0));
    if (state.discount > 0) {
      root.querySelector('[data-total="discount"]').textContent = `−${money(state.discount)}`;
      root.querySelector('[data-coupon-chip]').textContent = state.couponCode || '';
    }
    root.querySelector('[data-total="shipping"]').textContent = shipping === 0 ? 'Free' : money(shipping);
    root.querySelector('[data-total="grand"]').textContent = money(grand);

    return { subtotal: state.subtotal, discount: state.discount, shippingCost: shipping, total: grand };
  }

  function renderRecap() {
    const totals = recomputeTotals();
    const recap = document.getElementById('review-recap');

    const addressText = address
      ? (address.shippingAddressId ? 'Saved address from your account' : `${address.shippingAddress.street}, ${address.shippingAddress.city} ${address.shippingAddress.postalCode}, ${address.shippingAddress.country}`)
      : '';

    recap.innerHTML = '';
    const lines = [
      `Deliver to: ${addressText}`,
      `Payment: ${paymentMethod() === 'COD' ? 'Cash on delivery' : 'Card'}`,
      '',
      `Subtotal ${money(totals.subtotal)}`,
      totals.discount > 0 ? `Discount (${state.couponCode}) −${money(totals.discount)}` : null,
      `Shipping ${totals.shippingCost === 0 ? 'Free' : money(totals.shippingCost)}`,
      `TOTAL ${money(totals.total)}`,
    ];
    lines.filter((line) => line !== null).forEach((line) => {
      const p = document.createElement(line ? 'p' : 'span');
      p.className = line.startsWith('TOTAL') ? 'fw-bold text-dark mb-0' : 'mb-1';
      p.textContent = line || '\u00A0';
      recap.appendChild(p);
    });
  }

  /* -------------------------------- Coupon --------------------------------- */

  document.querySelector('.js-apply-coupon')?.addEventListener('click', async () => {
    const input = document.getElementById('coupon-code');
    const feedback = document.getElementById('coupon-feedback');
    const code = input.value.trim();
    feedback.textContent = '';
    feedback.className = 'small mb-0';

    try {
      const result = await window.app.api('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });

      if (result.data.valid) {
        state.couponCode = result.data.code;
        state.subtotal = result.data.subtotal;
        state.discount = result.data.discountAmount;
        feedback.textContent = result.message;
        feedback.classList.add('text-success');
        renderRecap();
        showStep(3); // jump straight to review with fresh numbers
      } else {
        feedback.textContent = result.message;
        feedback.classList.add('text-danger');
      }
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('text-danger');
    }
  });

  /* ------------------------------ Place order ------------------------------ */

  document.querySelector('.js-place-order')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Processing...';

    const payload = { ...address, paymentMethod: paymentMethod(), couponCode: state.couponCode };
    const card = collectCard();
    if (card) payload.card = card;

    try {
      const result = await window.app.api('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.app.updateBadge('cart', 0);
      window.location.href = `/orders/${result.data.order._id}?placed=1`;
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Place order';
      window.app.showToast(error.message, 'danger');
      if (error.status === 401) {
        window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }
  });

  /* Init */
  state.subtotal = Number(
    root.querySelector('[data-total="subtotal"]').textContent.replace(/[^0-9.]/g, ''),
  );
  recomputeTotals();
})();
