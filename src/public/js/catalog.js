/* ShopSphere - catalog page enhancements */

(function () {
  'use strict';

  /* Sort select submits the filter form on change */
  document.querySelectorAll('.js-auto-submit').forEach((select) => {
    select.addEventListener('change', () => {
      const form = select.closest('form') || document.getElementById('catalog-filters-desktop');
      if (form) {
        let sortInput = form.querySelector('input[name="sort"]');
        if (!sortInput) {
          sortInput = document.createElement('input');
          sortInput.type = 'hidden';
          sortInput.name = 'sort';
          form.appendChild(sortInput);
        }
        sortInput.value = select.value;
        form.submit();
      } else {
        const url = new URL(window.location.href);
        if (select.value) url.searchParams.set('sort', select.value);
        else url.searchParams.delete('sort');
        url.searchParams.set('page', '1');
        window.location.href = url.toString();
      }
    });
  });

  /* Quick Brand Search Filter inside Sidebar */
  document.querySelectorAll('.js-brand-search').forEach((input) => {
    input.addEventListener('input', () => {
      const term = input.value.trim().toLowerCase();
      const container = input.closest('.filter-panel') || document;
      container.querySelectorAll('.brand-item').forEach((item) => {
        const name = (item.dataset.name || item.textContent).toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
      });
    });
  });

  /* ------------------- Dual Range Price Slider Controller ------------------ */
  document.querySelectorAll('.price-slider-wrapper').forEach((wrapper) => {
    const minSlider = wrapper.querySelector('.price-slider-min');
    const maxSlider = wrapper.querySelector('.price-slider-max');
    const highlight = wrapper.querySelector('.price-slider-highlight');
    const container = wrapper.closest('.filter-panel') || wrapper.parentElement;
    const minInput = container.querySelector('.js-min-price-input');
    const maxInput = container.querySelector('.js-max-price-input');
    const label = container.querySelector('.js-slider-price-label, .js-slider-price-label-mobile');

    const minLimit = Number.parseFloat(wrapper.dataset.min) || 0;
    const maxLimit = Number.parseFloat(wrapper.dataset.max) || 500;

    function updateTrack() {
      let minVal = Number.parseFloat(minSlider.value);
      let maxVal = Number.parseFloat(maxSlider.value);

      if (minVal > maxVal) {
        const tmp = minVal;
        minVal = maxVal;
        maxVal = tmp;
      }

      const leftPercent = ((minVal - minLimit) / (maxLimit - minLimit)) * 100;
      const rightPercent = 100 - ((maxVal - minLimit) / (maxLimit - minLimit)) * 100;

      if (highlight) {
        highlight.style.left = `${leftPercent}%`;
        highlight.style.right = `${rightPercent}%`;
      }

      if (label) {
        label.textContent = `$${minVal} – $${maxVal}`;
      }

      if (minInput && document.activeElement !== minInput) {
        minInput.value = minVal > minLimit ? minVal : '';
      }
      if (maxInput && document.activeElement !== maxInput) {
        maxInput.value = maxVal < maxLimit ? maxVal : '';
      }
    }

    if (minSlider && maxSlider) {
      minSlider.addEventListener('input', () => {
        if (Number.parseFloat(minSlider.value) > Number.parseFloat(maxSlider.value)) {
          minSlider.value = maxSlider.value;
        }
        updateTrack();
      });

      maxSlider.addEventListener('input', () => {
        if (Number.parseFloat(maxSlider.value) < Number.parseFloat(minSlider.value)) {
          maxSlider.value = minSlider.value;
        }
        updateTrack();
      });

      if (minInput) {
        minInput.addEventListener('input', () => {
          const val = Number.parseFloat(minInput.value);
          minSlider.value = Number.isNaN(val) ? minLimit : Math.min(Math.max(val, minLimit), maxLimit);
          updateTrack();
        });
      }

      if (maxInput) {
        maxInput.addEventListener('input', () => {
          const val = Number.parseFloat(maxInput.value);
          maxSlider.value = Number.isNaN(val) ? maxLimit : Math.min(Math.max(val, minLimit), maxLimit);
          updateTrack();
        });
      }

      updateTrack();
    }
  });

  /* Quick Price Presets */
  document.querySelectorAll('.js-price-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.closest('form') || document.getElementById('catalog-filters-desktop');
      if (!form) return;
      const minInput = form.querySelector('input[name="minPrice"]');
      const maxInput = form.querySelector('input[name="maxPrice"]');
      if (minInput) minInput.value = btn.dataset.min || '';
      if (maxInput) maxInput.value = btn.dataset.max || '';
      form.submit();
    });
  });

  /* Remove individual active filter chip (supports multi-value lists) */
  document.querySelectorAll('.js-remove-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const valToRemove = btn.dataset.val;
      const url = new URL(window.location.href);

      if (valToRemove && (key === 'category' || key === 'brand')) {
        const currentVals = (url.searchParams.get(key) || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        const nextVals = currentVals.filter((v) => v !== valToRemove.toLowerCase());
        if (nextVals.length > 0) {
          url.searchParams.set(key, nextVals.join(','));
        } else {
          url.searchParams.delete(key);
        }
      } else {
        url.searchParams.delete(key);
      }

  /* ------------------- Grid / List View Switcher ------------------- */
  const gridBtn = document.getElementById('btn-grid-view');
  const listBtn = document.getElementById('btn-list-view');
  const productsContainer = document.getElementById('catalog-products-container');

  function setCatalogView(view) {
    if (!productsContainer) return;
    if (view === 'list') {
      productsContainer.classList.add('product-list-layout');
      if (listBtn) listBtn.classList.add('active');
      if (gridBtn) gridBtn.classList.remove('active');
      localStorage.setItem('shopsphere_catalog_view', 'list');
    } else {
      productsContainer.classList.remove('product-list-layout');
      if (gridBtn) gridBtn.classList.add('active');
      if (listBtn) listBtn.classList.remove('active');
      localStorage.setItem('shopsphere_catalog_view', 'grid');
    }
  }

  if (gridBtn && listBtn) {
    gridBtn.addEventListener('click', () => setCatalogView('grid'));
    listBtn.addEventListener('click', () => setCatalogView('list'));

    const savedView = localStorage.getItem('shopsphere_catalog_view');
    if (savedView === 'list') {
      setCatalogView('list');
    }
  }

  /* ------------------- Quick View Modal AJAX Handler ---------------- */
  const qvModalEl = document.getElementById('quickViewModal');
  const qvModal = qvModalEl && typeof bootstrap !== 'undefined' ? new bootstrap.Modal(qvModalEl) : null;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-quick-view');
    if (!btn || !qvModal) return;

    const slug = btn.dataset.productSlug;
    if (!slug) return;

    try {
      const res = await window.app.api(`/api/products/${slug}`);
      if (res && res.data && res.data.product) {
        const p = res.data.product;

        const imgEl = document.getElementById('qv-image');
        const brandEl = document.getElementById('qv-brand');
        const titleEl = document.getElementById('qv-title');
        const priceEl = document.getElementById('qv-price');
        const oldPriceEl = document.getElementById('qv-old-price');
        const descEl = document.getElementById('qv-desc');
        const stockEl = document.getElementById('qv-stock');
        const skuEl = document.getElementById('qv-sku');
        const addBtn = document.getElementById('qv-add-btn');
        const linkEl = document.getElementById('qv-details-link');
        const ratingEl = document.getElementById('qv-rating');

        if (imgEl) imgEl.src = (p.images && p.images[0]) || '/images/placeholder.svg';
        if (brandEl) brandEl.textContent = p.brand ? p.brand.name : '';
        if (titleEl) titleEl.textContent = p.name;
        if (priceEl) priceEl.textContent = `$${Number(p.effectivePrice || p.price).toFixed(2)}`;
        if (oldPriceEl) {
          if (p.discountPrice != null) {
            oldPriceEl.textContent = `$${Number(p.price).toFixed(2)}`;
            oldPriceEl.classList.remove('d-none');
          } else {
            oldPriceEl.classList.add('d-none');
          }
        }
        if (descEl) descEl.textContent = p.description || '';
        if (stockEl) {
          if (p.stock > 0) {
            stockEl.textContent = `In Stock (${p.stock})`;
            stockEl.className = 'badge bg-success-subtle text-success-emphasis border border-success-subtle py-1 px-2';
            if (addBtn) {
              addBtn.disabled = false;
              addBtn.dataset.productId = p._id;
            }
          } else {
            stockEl.textContent = 'Out of Stock';
            stockEl.className = 'badge bg-danger-subtle text-danger-emphasis border border-danger-subtle py-1 px-2';
            if (addBtn) addBtn.disabled = true;
          }
        }
        if (skuEl) skuEl.textContent = p.sku ? `SKU: ${p.sku}` : '';
        if (linkEl) linkEl.href = `/products/${p.slug}`;
        if (ratingEl) {
          ratingEl.innerHTML = `
            <span class="text-warning small"><i class="bi bi-star-fill"></i> ${Number(p.rating || 5).toFixed(1)}</span>
            <span class="text-muted small">(${p.reviewCount || 0} reviews)</span>
          `;
        }

        qvModal.show();
      }
    } catch (_err) {
      window.location.href = `/products/${slug}`;
    }
  });
})();


