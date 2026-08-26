(function () {
  'use strict';
  try {
    const saved = localStorage.getItem('shopsphere-theme') || 'auto';
    const theme = saved === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : saved;
    document.documentElement.setAttribute('data-bs-theme', theme);
  } catch (_e) {}
})();

