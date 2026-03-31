/**
 * script.js
 * DigitalStudyCenter — Login Page
 * Uses backend API instead of direct Supabase calls.
 */

import { auth } from "./api.js";

// LOGIN FIELD ID MAP — Maps each role to its corresponding HTML element IDs
const loginFieldIds = {
  student: {
    emailId: "student-login-email",
    passId: "student-login-password",
    emailErr: "student-login-email-error",
    passErr: "student-login-password-error",
    genErr: "student-login-general-error",
  },
  teacher: {
    emailId: "teacher-login-email",
    passId: "teacher-login-password",
    emailErr: "teacher-login-email-error",
    passErr: "teacher-login-password-error",
    genErr: "teacher-login-general-error",
  },
  admin: {
    emailId: "admin-login-email",
    passId: "admin-login-password",
    emailErr: "admin-login-email-error",
    passErr: "admin-login-password-error",
    genErr: "admin-login-general-error",
  },
};

const redirectMap = {
  student: "student-portal",
  teacher: "teacher-portal",
  // admin: "admin-portal",
};

// SHARED HELPERS
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

// LOGIN — ROLE SWITCH
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

// LOGIN — HANDLE LOGIN
async function handleLogin(role) {
  clearErrors();
  const ids = loginFieldIds[role];
  const { valid, email, pass } = validateLoginFields(
    ids.emailId,
    ids.passId,
    ids.emailErr,
    ids.passErr,
  );
  if (!valid) return;

  const btn = document.getElementById(role + "-login-submit");
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
  .getElementById("student-login-submit")
  .addEventListener("click", () => handleLogin("student"));
document
  .getElementById("teacher-login-submit")
  .addEventListener("click", () => handleLogin("teacher"));
document
  .getElementById("admin-login-submit")
  .addEventListener("click", () => handleLogin("admin"));

// ADMIN MODAL
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

// ENTER KEY SUPPORT
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  // Forgot password modal takes priority if open
  const forgotOpen = document
    .getElementById("forgot-modal")
    .classList.contains("open");
  if (forgotOpen) {
    const activeStep = document.querySelector("#forgot-modal .fp-step.active");
    if (activeStep?.id === "forgot-password-step-1") {
      sendResetEmail();
      return;
    }
    if (activeStep?.id === "forgot-password-step-2") {
      verifyOTP();
      return;
    }
    if (activeStep?.id === "forgot-password-step-3") {
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

// FORGOT PASSWORD SYSTEM

/* Internal state */
let forgotPasswordEmail = "";
let forgotPasswordCurrentStep = 1;

const modal = document.getElementById("forgot-modal");
const modalTitle = document.getElementById("forgot-password-modal-title");
const modalSub = document.getElementById("forgot-password-modal-subtitle");

const dots = [
  document.getElementById("forgot-password-step-dot-1"),
  document.getElementById("forgot-password-step-dot-2"),
  document.getElementById("forgot-password-step-dot-3"),
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


function openForgotModal() {
  resetForgotModal();
  modal.classList.add("open");
}

function closeForgotModal() {
  modal.classList.remove("open");
  setTimeout(resetForgotModal, 300);
}

function resetForgotModal() {
  forgotPasswordEmail = "";
  forgotPasswordCurrentStep = 1;
  goToFpStep(1);

  ["forgot-password-email", "forgot-password-otp-input", "forgot-password-new-password", "forgot-password-confirm-password"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  [
    "forgot-password-email-error",
    "forgot-password-otp-error",
    "forgot-password-new-password-error",
    "forgot-password-confirm-error",
    "forgot-password-step-1-error",
    "forgot-password-step-2-error",
    "forgot-password-step-3-error",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  document.getElementById("forgot-password-success").classList.remove("visible");
  document.getElementById("fp-steps-indicator")?.classList?.remove("hidden");
  document.querySelector(".fp-steps-indicator").style.display = "flex";

  document.getElementById("password-strength-fill").style.width = "0%";
  document.getElementById("password-strength-label").textContent = "";
}


function goToFpStep(step) {
  forgotPasswordCurrentStep = step;

  document
    .querySelectorAll(".fp-step")
    .forEach((s) => s.classList.remove("active"));
  const target = document.getElementById("forgot-password-step-" + step);
  if (target) target.classList.add("active");

  modalTitle.textContent = stepTitles[step - 1];
  modalSub.textContent = stepSubs[step - 1];

  dots.forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < step) dot.classList.add("done");
    if (i + 1 === step) dot.classList.add("active");
  });
}


document.querySelectorAll("[data-open-forgot]").forEach((btn) => {
  btn.addEventListener("click", openForgotModal);
});


document
  .getElementById("close-forgot-modal")
  .addEventListener("click", closeForgotModal);

modal.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeForgotModal();
});


document
  .getElementById("forgot-password-back-to-step-1")
  .addEventListener("click", () => goToFpStep(1));
document
  .getElementById("forgot-password-back-to-step-2")
  .addEventListener("click", () => goToFpStep(2));


document
  .getElementById("forgot-password-done-button")
  .addEventListener("click", closeForgotModal);

// STEP 1 — sendResetEmail()
async function sendResetEmail() {
  document.getElementById("forgot-password-email-error").textContent = "";
  document.getElementById("forgot-password-step-1-error").textContent = "";

  const emailVal = document.getElementById("forgot-password-email").value.trim();

  if (!emailVal) {
    document.getElementById("forgot-password-email-error").textContent = "Email is required.";
    return;
  }
  if (!validateEmail(emailVal)) {
    document.getElementById("forgot-password-email-error").textContent =
      "Enter a valid email address.";
    return;
  }

  const btn = document.getElementById("forgot-password-send-button");
  setLoading(btn, true, "Send Verification Code");

  try {
    await auth.forgotPassword(emailVal);

    forgotPasswordEmail = emailVal;
    goToFpStep(2);
  } catch (err) {
    document.getElementById("forgot-password-step-1-error").textContent =
      err.message || "Failed to send reset email. Please try again.";
  } finally {
    setLoading(btn, false, "Send Verification Code");
  }
}

document
  .getElementById("forgot-password-send-button")
  .addEventListener("click", sendResetEmail);

/* Resend */
document.getElementById("forgot-password-resend-button").addEventListener("click", async () => {
  const btn = document.getElementById("forgot-password-resend-button");
  btn.disabled = true;
  btn.textContent = "Sending…";
  document.getElementById("forgot-password-step-2-error").textContent = "";

  try {
    await auth.forgotPassword(forgotPasswordEmail);
    btn.textContent = "Code Resent ✓";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Resend Code";
    }, 4000);
  } catch (err) {
    document.getElementById("forgot-password-step-2-error").textContent =
      err.message || "Failed to resend.";
    btn.disabled = false;
    btn.textContent = "Resend Code";
  }
});

// STEP 2 — verifyOTP()
async function verifyOTP() {
  document.getElementById("forgot-password-otp-error").textContent = "";
  document.getElementById("forgot-password-step-2-error").textContent = "";

  const otp = document.getElementById("forgot-password-otp-input").value.trim();

  if (!otp) {
    document.getElementById("forgot-password-otp-error").textContent =
      "Verification code is required.";
    return;
  }
  if (!/^\d{6}$/.test(otp)) {
    document.getElementById("forgot-password-otp-error").textContent =
      "Enter the 6-digit code from your email.";
    return;
  }

  const btn = document.getElementById("forgot-password-verify-button");
  setLoading(btn, true, "Verify Code");

  try {
    await auth.verifyOtp(forgotPasswordEmail, otp);
    goToFpStep(3);
  } catch (err) {
    document.getElementById("forgot-password-step-2-error").textContent =
      err.message || "Invalid or expired code. Please try again.";
  } finally {
    setLoading(btn, false, "Verify Code");
  }
}

document.getElementById("forgot-password-verify-button").addEventListener("click", verifyOTP);


document.getElementById("forgot-password-otp-input").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

// STEP 3 — updatePassword()
async function updatePassword() {
  document.getElementById("forgot-password-new-password-error").textContent = "";
  document.getElementById("forgot-password-confirm-error").textContent = "";
  document.getElementById("forgot-password-step-3-error").textContent = "";

  const newPass = document.getElementById("forgot-password-new-password").value;
  const confirmPass = document.getElementById("forgot-password-confirm-password").value;

  let valid = true;

  if (!newPass) {
    document.getElementById("forgot-password-new-password-error").textContent =
      "New password is required.";
    valid = false;
  } else if (newPass.length < 8) {
    document.getElementById("forgot-password-new-password-error").textContent =
      "Password must be at least 8 characters.";
    valid = false;
  }

  if (!confirmPass) {
    document.getElementById("forgot-password-confirm-error").textContent =
      "Please confirm your password.";
    valid = false;
  } else if (newPass !== confirmPass) {
    document.getElementById("forgot-password-confirm-error").textContent =
      "Passwords do not match.";
    valid = false;
  }

  if (!valid) return;

  const btn = document.getElementById("forgot-password-update-button");
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
    document.getElementById("forgot-password-success").classList.add("visible");
  } catch (err) {
    document.getElementById("forgot-password-step-3-error").textContent =
      err.message || "Failed to update password. Please try again.";
  } finally {
    setLoading(btn, false, "Update Password");
  }
}

document
  .getElementById("forgot-password-update-button")
  .addEventListener("click", updatePassword);

// PASSWORD STRENGTH METER
function measureStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

document.getElementById("forgot-password-new-password").addEventListener("input", (e) => {
  const pw = e.target.value;
  const score = measureStrength(pw);
  const fill = document.getElementById("password-strength-fill");
  const label = document.getElementById("password-strength-label");

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

// HANDLE REDIRECT AFTER PASSWORD RESET LINK
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
