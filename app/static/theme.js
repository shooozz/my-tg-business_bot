// ByBlock Theme System
(function() {
  'use strict';

  // Load theme from localStorage or default to light
  const savedTheme = localStorage.getItem('byblock-theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', function() {
    const themeButtons = document.querySelectorAll('.theme-toggle button');

    // Set active button
    themeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === savedTheme);
    });

    // Handle theme switch
    themeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const theme = this.dataset.theme;

        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('byblock-theme', theme);

        themeButtons.forEach(b => {
          b.classList.toggle('active', b.dataset.theme === theme);
        });
      });
    });
  });
})();
