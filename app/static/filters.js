// Enhanced Filters for ByBlock Admin Panel
(function() {
  'use strict';

  let activeFilters = {
    provider: 'all',
    category: 'all',
    status: 'all'
  };

  // Get unique categories from products
  function getCategories() {
    if (!window.marketData || !window.marketData.products) return [];
    const categories = new Set();
    window.marketData.products.forEach(p => {
      if (p.data && p.data.category) {
        categories.add(p.data.category);
      }
    });
    return Array.from(categories).sort();
  }

  // Get unique providers
  function getProviders() {
    if (!window.marketData || !window.marketData.products) return [];
    const providers = new Set();
    window.marketData.products.forEach(p => {
      if (p.provider) {
        providers.add(p.provider);
      }
    });
    return Array.from(providers).sort();
  }

  // Create filter UI
  function createFilterUI() {
    const categories = getCategories();
    const providers = getProviders();

    let html = '<div class="filter-bar">';

    // Provider filter
    if (providers.length > 0) {
      html += '<select id="filter-provider" class="filter-select">';
      html += '<option value="all">Все провайдеры</option>';
      providers.forEach(p => {
        html += `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`;
      });
      html += '</select>';
    }

    // Category filter
    if (categories.length > 0) {
      html += '<select id="filter-category" class="filter-select">';
      html += '<option value="all">Все категории</option>';
      categories.forEach(cat => {
        html += `<option value="${cat}">${cat}</option>`;
      });
      html += '</select>';
    }

    // Status filter
    html += '<select id="filter-status" class="filter-select">';
    html += '<option value="all">Все статусы</option>';
    html += '<option value="visible">В продаже</option>';
    html += '<option value="hidden">Скрыто</option>';
    html += '<option value="out">Нет в наличии</option>';
    html += '</select>';

    // Reset button
    html += '<button id="filter-reset" class="filter-reset">Сбросить</button>';
    html += '</div>';

    return html;
  }

  // Apply filters to products
  function applyFilters() {
    const rows = document.querySelectorAll('[data-product-row]');

    rows.forEach(row => {
      let visible = true;

      // Provider filter
      if (activeFilters.provider !== 'all') {
        if (row.dataset.provider !== activeFilters.provider) {
          visible = false;
        }
      }

      // Category filter
      if (activeFilters.category !== 'all') {
        if (row.dataset.category !== activeFilters.category) {
          visible = false;
        }
      }

      // Status filter
      if (activeFilters.status !== 'all') {
        const isVisible = row.dataset.visible === 'true';
        const isAvailable = row.dataset.available === 'true';

        if (activeFilters.status === 'visible' && !isVisible) {
          visible = false;
        } else if (activeFilters.status === 'hidden' && isVisible) {
          visible = false;
        } else if (activeFilters.status === 'out' && isAvailable) {
          visible = false;
        }
      }

      // Search filter (from existing search input)
      const searchInput = document.getElementById('product-search');
      if (searchInput && searchInput.value) {
        const searchText = searchInput.value.toLowerCase();
        if (!row.dataset.search.includes(searchText)) {
          visible = false;
        }
      }

      row.hidden = !visible;
    });

    // Update count
    updateFilterCount();
  }

  // Update visible products count
  function updateFilterCount() {
    const visibleCount = document.querySelectorAll('[data-product-row]:not([hidden])').length;
    const totalCount = document.querySelectorAll('[data-product-row]').length;

    const countElement = document.querySelector('.filter-count');
    if (countElement) {
      countElement.textContent = `Показано: ${visibleCount} из ${totalCount}`;
    }
  }

  // Initialize filters
  function initFilters() {
    // Add event listeners
    const providerSelect = document.getElementById('filter-provider');
    const categorySelect = document.getElementById('filter-category');
    const statusSelect = document.getElementById('filter-status');
    const resetButton = document.getElementById('filter-reset');

    if (providerSelect) {
      providerSelect.value = activeFilters.provider;
      providerSelect.addEventListener('change', e => {
        activeFilters.provider = e.target.value;
        applyFilters();
      });
    }

    if (categorySelect) {
      categorySelect.value = activeFilters.category;
      categorySelect.addEventListener('change', e => {
        activeFilters.category = e.target.value;
        applyFilters();
      });
    }

    if (statusSelect) {
      statusSelect.value = activeFilters.status;
      statusSelect.addEventListener('change', e => {
        activeFilters.status = e.target.value;
        applyFilters();
      });
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        activeFilters = { provider: 'all', category: 'all', status: 'all' };
        if (providerSelect) providerSelect.value = 'all';
        if (categorySelect) categorySelect.value = 'all';
        if (statusSelect) statusSelect.value = 'all';

        const searchInput = document.getElementById('product-search');
        if (searchInput) searchInput.value = '';

        applyFilters();
      });
    }

    // Also apply on search input
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => applyFilters());
    }

    // Initial apply
    applyFilters();
  }

  // Export functions
  window.ByBlockFilters = {
    createFilterUI,
    initFilters,
    applyFilters
  };
})();
