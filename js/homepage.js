// ── Mobile Menu Toggle ──
const menuToggle = document.getElementById('menu-toggle');
const siteNav = document.getElementById('site-nav');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  siteNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      siteNav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// ── Animated Counters ──
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.floor(target * eased) + (target >= 100 ? '+' : '%');
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ── Progress Bars ──
function animateBars() {
  document.querySelectorAll('.dash-bar-fill').forEach(bar => {
    const width = bar.dataset.width || 0;
    setTimeout(() => { bar.style.width = width + '%'; }, 300);
  });
}

// ── Scroll Reveal ──
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Contact Form ──
const contactForm = document.getElementById('contact-form');
const formFeedback = document.getElementById('form-feedback');

if (contactForm && formFeedback) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;

    try {
      const formData = new FormData(contactForm);
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        formFeedback.style.color = '#10b981';
        const name = (formData.get('firstName') || '').toString().trim();
        formFeedback.textContent = name
          ? `Thanks, ${name}! Your message has been sent successfully.`
          : 'Thanks! Your message has been sent successfully.';
        contactForm.reset();
      } else {
        formFeedback.style.color = '#ef4444';
        formFeedback.textContent = 'Failed to send. Please try again.';
      }
    } catch (err) {
      formFeedback.style.color = '#ef4444';
      formFeedback.textContent = 'Network error. Please try again later.';
    }

    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    setTimeout(() => { formFeedback.textContent = ''; }, 6000);
  });
}

// ── Active Nav Highlight ──
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      const top = section.offsetTop - 100;
      if (window.scrollY >= top) current = section.getAttribute('id');
    });
    navLinks.forEach(link => {
      link.style.color = link.getAttribute('href') === '#' + current ? 'var(--text)' : '';
    });
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  animateCounters();
  animateBars();
  initReveal();
  initActiveNav();
});
