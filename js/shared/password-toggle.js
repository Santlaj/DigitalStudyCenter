export function initPasswordToggles() {
  const wrappers = document.querySelectorAll('.password-wrapper');

  wrappers.forEach(wrapper => {
    const input = wrapper.querySelector('.field-input[type="password"]');
    const toggleBtn = wrapper.querySelector('.password-toggle-btn');

    // Only attach if both elements exist
    if (!input || !toggleBtn) return;

    const eyeIconHtml = `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>`;
    const eyeOffIconHtml = `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line>`;

    toggleBtn.addEventListener('click', () => {
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);

      const svg = toggleBtn.querySelector('svg');
      if (svg) {
        svg.innerHTML = type === 'password' ? eyeIconHtml : eyeOffIconHtml;
      }
    });
  });
}
