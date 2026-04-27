export function initPasswordToggles() {
  const wrappers = document.querySelectorAll('.password-wrapper');

  wrappers.forEach(wrapper => {
    const input = wrapper.querySelector('.field-input');
    const toggleBtn = wrapper.querySelector('.password-toggle-btn');

    if (!input || !toggleBtn) return;

    const iconEye = toggleBtn.querySelector('.icon-eye');
    const iconEyeOff = toggleBtn.querySelector('.icon-eye-off');

    toggleBtn.addEventListener('click', () => {
      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');

      if (iconEye && iconEyeOff) {
        iconEye.classList.toggle('hidden');
        iconEyeOff.classList.toggle('hidden');
      }
    });
  });
}
