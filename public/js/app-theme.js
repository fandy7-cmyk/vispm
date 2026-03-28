// ============== THEME TOGGLE ==============
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('spm_theme', newTheme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

// Terapkan tema yang tersimpan saat load
(function applyStoredTheme() {
  const saved = localStorage.getItem('spm_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  }
})();

