/**
 * script.js
 * DigitalStudyCenter — Login Page
 * Uses backend API instead of direct Supabase calls.
 */

import { auth } from "./api.js";

/* ─────────────────────────────────────────────
       SHARED FIELD MAP
   ───────────────────────────────────────────── */
const fieldMap = {
  student: {
    emailId: "s-email",
    passId: "s-pass",
    emailErr: "s-email-err",
    passErr: "s-pass-err",
    genErr: "s-general-err",
  },
  teacher: {
    emailId: "t-email",
    passId: "t-pass",
    emailErr: "t-email-err",
    passErr: "t-pass-err",
    genErr: "t-general-err",
  },
  admin: {
    emailId: "a-email",
    passId: "a-pass",
    emailErr: "a-email-err",
    passErr: "a-pass-err",
    genErr: "a-general-err",
  },
};

const redirectMap = {
  student: "student-portal",
  teacher: "teacher-portal",
  // admin: "admin-portal",
};

/* ─────────────────────────────────────────────
       SHARED HELPERS
   ───────────────────────────────────────────── */
function clearErrors() {
  document
    .querySelectorAll(".error-msg")
    .forEach((el) => (el.textContent = ""));
}

function setLoading(btnEl, loading, idleText) {
  if (!btnEl) return;
  btnEl.disabled = loading;
  btnEl.innerHTML = loading
    ? '<span class="spinner"></span>Please wait…'
    : idleText;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLoginFields(emailId, passId, emailErrId, passErrId) {
  let valid = true;
  const email = document.getElementById(emailId).value.trim();
  const pass = document.getElementById(passId).value;
  if (!email) {
    document.getElementById(emailErrId).textContent = "Email is required.";
    valid = false;
  } else if (!validateEmail(email)) {
    document.getElementById(emailErrId).textContent =
      "Enter a valid email address.";
    valid = false;
  }
  if (!pass) {
    document.getElementById(passErrId).textContent = "Password is required.";
    valid = false;
  } else if (pass.length < 6) {
    document.getElementById(passErrId).textContent =
      "Password must be at least 6 characters.";
    valid = false;
  }
  return { valid, email, pass };
}

/* ─────────────────────────────────────────────
       LOGIN — ROLE SWITCH
   ───────────────────────────────────────────── */
function switchRole(role) {
  document
    .querySelectorAll(".form-section")
    .forEach((f) => f.classList.remove("active"));
  document
    .querySelectorAll(".toggle-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("form-" + role).classList.add("active");
  document.getElementById("btn-" + role).classList.add("active");
  clearErrors();
}

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchRole(btn.dataset.role));
});

/* ─────────────────────────────────────────────
       LOGIN — HANDLE LOGIN
   ───────────────────────────────────────────── */
async function handleLogin(role) {
  clearErrors();
  const ids = fieldMap[role];
  const { valid, email, pass } = validateLoginFields(
    ids.emailId,
    ids.passId,
    ids.emailErr,
    ids.passErr,
  );
  if (!valid) return;

  const btn = document.getElementById(role[0] + "-submit");
  const idleLabel = role === "admin" ? "Login as Admin" : "Login";
  setLoading(btn, true, idleLabel);

  try {
    const data = await auth.login(email, pass, role);

    // Redirect to dashboard
    window.location.href = redirectMap[role] || "index.html";
  } catch (err) {
    document.getElementById(ids.genErr).textContent =
      err.message || "Login failed. Please try again.";
  } finally {
    setLoading(btn, false, idleLabel);
  }
}

document
  .getElementById("s-submit")
  .addEventListener("click", () => handleLogin("student"));
document
  .getElementById("t-submit")
  .addEventListener("click", () => handleLogin("teacher"));
document
  .getElementById("a-submit")
  .addEventListener("click", () => handleLogin("admin"));

/* ─────────────────────────────────────────────
       ADMIN MODAL
   ───────────────────────────────────────────── */
document.getElementById("open-admin-modal").addEventListener("click", () => {
  document.getElementById("admin-modal").classList.add("open");
});

document.getElementById("close-admin-modal").addEventListener("click", () => {
  document.getElementById("admin-modal").classList.remove("open");
  clearErrors();
});

document.getElementById("admin-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove("open");
    clearErrors();
  }
});

/* ─────────────────────────────────────────────
       ENTER KEY SUPPORT
   ───────────────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  // Forgot password modal takes priority if open
  const forgotOpen = document
    .getElementById("forgot-modal")
    .classList.contains("open");
  if (forgotOpen) {
    const activeStep = document.querySelector("#forgot-modal .fp-step.active");
    if (activeStep?.id === "fp-step-1") {
      sendResetEmail();
      return;
    }
    if (activeStep?.id === "fp-step-2") {
      verifyOTP();
      return;
    }
    if (activeStep?.id === "fp-step-3") {
      updatePassword();
      return;
    }
    return;
  }

  const adminOpen = document
    .getElementById("admin-modal")
    .classList.contains("open");
  if (adminOpen) {
    handleLogin("admin");
    return;
  }

  const active = document.querySelector(".form-section.active");
  if (active?.id === "form-student") handleLogin("student");
  if (active?.id === "form-teacher") handleLogin("teacher");
});

/* ═════════════════════════════════════════════
       FORGOT PASSWORD SYSTEM
   ═════════════════════════════════════════════ */

/* Internal state */
let fpEmail = "";
let fpCurrentStep = 1;

const modal = document.getElementById("forgot-modal");
const modalTitle = document.getElementById("fp-modal-title");
const modalSub = document.getElementById("fp-modal-sub");

const dots = [
  document.getElementById("fp-dot-1"),
  document.getElementById("fp-dot-2"),
  document.getElementById("fp-dot-3"),
];

const stepTitles = [
  "Reset Password",
  "Enter Verification Code",
  "Set New Password",
];

const stepSubs = [
  "We'll send a verification code to your email.",
  "Check your inbox and paste the 6-digit code below.",
  "Choose a strong new password for your account.",
];

/* ── Open / close forgot modal ── */
function openForgotModal() {
  resetForgotModal();
  modal.classList.add("open");
}

function closeForgotModal() {
  modal.classList.remove("open");
  setTimeout(resetForgotModal, 300);
}

function resetForgotModal() {
  fpEmail = "";
  fpCurrentStep = 1;
  goToFpStep(1);

  ["fp-email", "fp-otp", "fp-newpass", "fp-confirmpass"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  [
    "fp-email-err",
    "fp-otp-err",
    "fp-newpass-err",
    "fp-confirm-err",
    "fp-step1-err",
    "fp-step2-err",
    "fp-step3-err",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  document.getElementById("fp-success").classList.remove("visible");
  document.getElementById("fp-steps-indicator")?.classList?.remove("hidden");
  document.querySelector(".fp-steps-indicator").style.display = "flex";

  document.getElementById("pw-fill").style.width = "0%";
  document.getElementById("pw-strength-label").textContent = "";
}

/* ── Step navigation ── */
function goToFpStep(step) {
  fpCurrentStep = step;

  document
    .querySelectorAll(".fp-step")
    .forEach((s) => s.classList.remove("active"));
  const target = document.getElementById("fp-step-" + step);
  if (target) target.classList.add("active");

  modalTitle.textContent = stepTitles[step - 1];
  modalSub.textContent = stepSubs[step - 1];

  dots.forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < step) dot.classList.add("done");
    if (i + 1 === step) dot.classList.add("active");
  });
}

/* ── Open triggers ── */
document.querySelectorAll("[data-open-forgot]").forEach((btn) => {
  btn.addEventListener("click", openForgotModal);
});

/* ── Close ── */
document
  .getElementById("close-forgot-modal")
  .addEventListener("click", closeForgotModal);

modal.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeForgotModal();
});

/* ── Back links ── */
document
  .getElementById("fp-back-to-1")
  .addEventListener("click", () => goToFpStep(1));
document
  .getElementById("fp-back-to-2")
  .addEventListener("click", () => goToFpStep(2));

/* ── Done / back to login ── */
document
  .getElementById("fp-done-btn")
  .addEventListener("click", closeForgotModal);

/* ─────────────────────────────────────────────
       STEP 1 — sendResetEmail()
   ───────────────────────────────────────────── */
async function sendResetEmail() {
  document.getElementById("fp-email-err").textContent = "";
  document.getElementById("fp-step1-err").textContent = "";

  const emailVal = document.getElementById("fp-email").value.trim();

  if (!emailVal) {
    document.getElementById("fp-email-err").textContent = "Email is required.";
    return;
  }
  if (!validateEmail(emailVal)) {
    document.getElementById("fp-email-err").textContent =
      "Enter a valid email address.";
    return;
  }

  const btn = document.getElementById("fp-send-btn");
  setLoading(btn, true, "Send Verification Code");

  try {
    await auth.forgotPassword(emailVal);

    fpEmail = emailVal;
    goToFpStep(2);
  } catch (err) {
    document.getElementById("fp-step1-err").textContent =
      err.message || "Failed to send reset email. Please try again.";
  } finally {
    setLoading(btn, false, "Send Verification Code");
  }
}

document
  .getElementById("fp-send-btn")
  .addEventListener("click", sendResetEmail);

/* Resend */
document.getElementById("fp-resend-btn").addEventListener("click", async () => {
  const btn = document.getElementById("fp-resend-btn");
  btn.disabled = true;
  btn.textContent = "Sending…";
  document.getElementById("fp-step2-err").textContent = "";

  try {
    await auth.forgotPassword(fpEmail);
    btn.textContent = "Code Resent ✓";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Resend Code";
    }, 4000);
  } catch (err) {
    document.getElementById("fp-step2-err").textContent =
      err.message || "Failed to resend.";
    btn.disabled = false;
    btn.textContent = "Resend Code";
  }
});

/* ─────────────────────────────────────────────
       STEP 2 — verifyOTP()
   ───────────────────────────────────────────── */
async function verifyOTP() {
  document.getElementById("fp-otp-err").textContent = "";
  document.getElementById("fp-step2-err").textContent = "";

  const otp = document.getElementById("fp-otp").value.trim();

  if (!otp) {
    document.getElementById("fp-otp-err").textContent =
      "Verification code is required.";
    return;
  }
  if (!/^\d{6}$/.test(otp)) {
    document.getElementById("fp-otp-err").textContent =
      "Enter the 6-digit code from your email.";
    return;
  }

  const btn = document.getElementById("fp-verify-btn");
  setLoading(btn, true, "Verify Code");

  try {
    await auth.verifyOtp(fpEmail, otp);
    goToFpStep(3);
  } catch (err) {
    document.getElementById("fp-step2-err").textContent =
      err.message || "Invalid or expired code. Please try again.";
  } finally {
    setLoading(btn, false, "Verify Code");
  }
}

document.getElementById("fp-verify-btn").addEventListener("click", verifyOTP);

/* ── Only allow digits in OTP field ── */
document.getElementById("fp-otp").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

/* ─────────────────────────────────────────────
       STEP 3 — updatePassword()
   ───────────────────────────────────────────── */
async function updatePassword() {
  document.getElementById("fp-newpass-err").textContent = "";
  document.getElementById("fp-confirm-err").textContent = "";
  document.getElementById("fp-step3-err").textContent = "";

  const newPass = document.getElementById("fp-newpass").value;
  const confirmPass = document.getElementById("fp-confirmpass").value;

  let valid = true;

  if (!newPass) {
    document.getElementById("fp-newpass-err").textContent =
      "New password is required.";
    valid = false;
  } else if (newPass.length < 8) {
    document.getElementById("fp-newpass-err").textContent =
      "Password must be at least 8 characters.";
    valid = false;
  }

  if (!confirmPass) {
    document.getElementById("fp-confirm-err").textContent =
      "Please confirm your password.";
    valid = false;
  } else if (newPass !== confirmPass) {
    document.getElementById("fp-confirm-err").textContent =
      "Passwords do not match.";
    valid = false;
  }

  if (!valid) return;

  const btn = document.getElementById("fp-update-btn");
  setLoading(btn, true, "Update Password");

  try {
    await auth.resetPassword(newPass);

    // Show success state
    document
      .querySelectorAll(".fp-step")
      .forEach((s) => s.classList.remove("active"));
    document.querySelector(".fp-steps-indicator").style.display = "none";
    modalTitle.textContent = "All Done!";
    modalSub.textContent = "";
    document.getElementById("fp-success").classList.add("visible");
  } catch (err) {
    document.getElementById("fp-step3-err").textContent =
      err.message || "Failed to update password. Please try again.";
  } finally {
    setLoading(btn, false, "Update Password");
  }
}

document
  .getElementById("fp-update-btn")
  .addEventListener("click", updatePassword);

/* ─────────────────────────────────────────────
       PASSWORD STRENGTH METER
   ───────────────────────────────────────────── */
function measureStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

document.getElementById("fp-newpass").addEventListener("input", (e) => {
  const pw = e.target.value;
  const score = measureStrength(pw);
  const fill = document.getElementById("pw-fill");
  const label = document.getElementById("pw-strength-label");

  const levels = [
    { pct: "0%", color: "", text: "" },
    { pct: "20%", color: "#ef4444", text: "Very weak" },
    { pct: "40%", color: "#f97316", text: "Weak" },
    { pct: "60%", color: "#eab308", text: "Fair" },
    { pct: "80%", color: "#22c55e", text: "Strong" },
    { pct: "100%", color: "#16a34a", text: "Very strong" },
  ];

  const lvl = pw.length === 0 ? levels[0] : levels[score] || levels[4];
  fill.style.width = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent = lvl.text;
  label.style.color = lvl.color;
});

/* ─────────────────────────────────────────────
       HANDLE REDIRECT AFTER PASSWORD RESET LINK
   ───────────────────────────────────────────── */
function handleResetRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") !== "true") return;

  // Open straight to step 3
  openForgotModal();
  goToFpStep(3);
  // Clean URL
  window.history.replaceState({}, "", window.location.pathname);
}

handleResetRedirect();
