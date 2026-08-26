/* ShopSphere - catalog page enhancements.
   The filters form works without JavaScript; this file only adds polish. */

(function () {
  'use strict';

  /* Sort select submits the filter form on change */
  document.querySelectorAll('.js-auto-submit').forEach((select) => {
    select.addEventListener('change', () => {
      if (select.form) select.form.submit();
    });
  });

  /* Radio/checkbox filters submit immediately (progressive enhancement) */
  document.querySelectorAll('#catalog-filters input[type="radio"], #catalog-filters input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.closest('form')) input.closest('form').submit();
    });
  });
})();
