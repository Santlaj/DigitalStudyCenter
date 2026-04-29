//  Mobile Menu Toggle 
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

//                    Scroll Reveal 
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

//                                     Contact Form 

const contactForm = document.getElementById('contact-form');
const formFeedback = document.getElementById('form-feedback');

if (contactForm && formFeedback) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;

    const formData = new FormData(contactForm);
    const phone = formData.get('phone');
    if (!/^[0-9]{10}$/.test(phone)) {
      formFeedback.style.color = '#ef4444';
      formFeedback.textContent = 'Please enter a valid 10-digit contact number.';
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }

    try {
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
        if (typeof initCharCount === 'function') {
          const charCountDisplay = document.getElementById('char-count');
          if (charCountDisplay) {
            charCountDisplay.textContent = '0 / 100';
            charCountDisplay.style.color = 'var(--rose)';
          }
        }
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

// Character Count 
function initCharCount() {
  const messageInput = document.getElementById('cf-message');
  const charCountDisplay = document.getElementById('char-count');

  if (messageInput && charCountDisplay) {
    messageInput.addEventListener('input', () => {
      const length = messageInput.value.length;
      charCountDisplay.textContent = `${length} / 100`;
      
      if (length < 100) {
        charCountDisplay.style.color = 'var(--rose)';
      } else {
        charCountDisplay.style.color = 'var(--text-dim)';
      }
    });
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initActiveNav();
  initCharCount();
});
