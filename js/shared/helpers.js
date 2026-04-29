

export const $ = (id) => document.getElementById(id);
export const $$ = (sel) => document.querySelectorAll(sel);




export function showToast(message, type = "info") {
  const t = $("toast");
  t.textContent = message;
  t.className = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = "toast"; }, 3500);
}

// To set loading state for button
export function setLoading(btnEl, loading, idleHtml = "Submit") {
  if (!btnEl) return;
  btnEl.disabled = loading;
  btnEl.innerHTML = loading
    ? `<span class="spinner"></span>Please wait…`
    : idleHtml;
}

// This formats the date in "DD MMM YYYY" format
export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// This formats the deadline in "DD MMM YYYY, HH:MM AM/PM" format
export function formatDeadline(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// This counts remaining time for deadline
export function deadlineCountdown(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - new Date();
  if (diff < 0) return "Overdue";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "Due very soon";
}

// return class name for css style for deadline
export function deadlineClass(iso) {
  if (!iso) return "";
  const diff = new Date(iso) - new Date();
  if (diff < 0) return "overdue";
  if (diff < 86400000) return "due-soon";
  return "";
}

// This counts Deadline is Overdue, Due today, Upcoming and No deadline
export function deadlinePill(iso) {
  if (!iso) return `<span class="pill pill-gray">No deadline</span>`;
  const diff = new Date(iso) - new Date();
  if (diff < 0) return `<span class="pill pill-red">Overdue</span>`;
  if (diff < 86400000) return `<span class="pill pill-amber">Due today</span>`;
  return `<span class="pill pill-green">Upcoming</span>`;
}


// To display name initials(like SK for Santlaj Kumar) for profile avatar
export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map(p => p[0]?.toUpperCase() || "").filter(Boolean).slice(0, 2).join("");
}

// Convert special HTML characters into safe text entities to prevent Crosss Site Scriptiong attacks
export function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function currentMonthLabel() {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function animateCounter(el, target, duration = 900) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * ease);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

export const COURSE_COLORS = [
  "linear-gradient(90deg,#4f46e5,#6366f1)",
  "linear-gradient(90deg,#0ea5e9,#38bdf8)",
  "linear-gradient(90deg,#10b981,#34d399)",
  "linear-gradient(90deg,#f59e0b,#fbbf24)",
  "linear-gradient(90deg,#ef4444,#f87171)",
  "linear-gradient(90deg,#8b5cf6,#a78bfa)",
  "linear-gradient(90deg,#ec4899,#f472b6)",
];

export function debounce(func, delay = 500) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

export function getCleanLink(path) {
  // If running locally (localhost or file://), use .html extensions
  // Otherwise use clean URLs for production web
  const isWebProduction = !window.location.hostname.includes('localhost') && !window.location.protocol.includes('file:');

  if (path === './' || path === 'index') {
    return isWebProduction ? 'login' : 'login.html';
  }

  if (isWebProduction) return path.replace(/\.html$/, '');
  return path.endsWith('.html') ? path : path + '.html';
}
