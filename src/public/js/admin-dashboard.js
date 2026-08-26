/* ShopSphere - admin dashboard charts.
   Chart data arrives via data-series attributes (CSP-safe, no inline JS). */

(function () {
  'use strict';

  const monthlyCanvas = document.getElementById('monthly-chart');
  if (typeof Chart === 'undefined') return;

  if (monthlyCanvas && monthlyCanvas.dataset.series) {
    const series = JSON.parse(monthlyCanvas.dataset.series);

    new Chart(monthlyCanvas, {
      type: 'bar',
      data: {
        labels: series.map((point) => point.label),
        datasets: [
          {
            label: 'Revenue ($)',
            data: series.map((point) => point.revenue),
            backgroundColor: 'rgba(79, 70, 229, 0.75)',
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Orders',
            data: series.map((point) => point.orders),
            type: 'line',
            borderColor: '#f59e0b',
            backgroundColor: '#f59e0b',
            tension: 0.35,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  const categoryCanvas = document.getElementById('category-chart');
  if (categoryCanvas && categoryCanvas.dataset.series) {
    const categories = JSON.parse(categoryCanvas.dataset.series);
    const palette = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: categories.map((row) => row.category),
        datasets: [{
          data: categories.map((row) => row.revenue),
          backgroundColor: palette.slice(0, categories.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: $${ctx.parsed.toFixed(2)}` } },
        },
      },
    });
  }
})();
