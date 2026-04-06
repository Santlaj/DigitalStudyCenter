import { auth, admin, announcements } from "../api.js";
import { showToast, formatDate } from "../shared/helpers.js";

// Session Guard
let currentUser = null;

async function checkAuth() {
  try {
    const data = await auth.checkSession();
    if (!data || !data.user || data.user.role !== "admin") {
      window.location.href = "login";
      return;
    }
    currentUser = data.user;
    
    document.getElementById("sidebar-user-name").textContent = currentUser.full_name || currentUser.email;
    document.getElementById("popup-name-large").textContent = currentUser.full_name || currentUser.email;
    document.getElementById("popup-email").textContent = currentUser.email;
    document.getElementById("auth-guard").style.display = "none";
    document.getElementById("app-shell").classList.add("visible");
    
    initDashboard();
  } catch (err) {
    console.error("Auth check failed:", err.message);
    window.location.href = "login";
  }
}

function renderActivities(activities) {
    const feed = document.getElementById("activities-feed");
    if (!activities || activities.length === 0) {
        feed.innerHTML = '<div class="empty-state-sm">No recent activities found.</div>';
        return;
    }

    feed.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-icon">
                ${act.type === 'Note Uploaded' ? '📄' : '👤'}
            </div>
            <div class="activity-content">
                <div class="activity-title">${act.type}</div>
                <div class="activity-desc">${act.description}</div>
            </div>
            <div class="activity-time">${formatDate(act.date)}</div>
        </div>
    `).join("");
}

async function loadStats() {
    try {
        const stats = await admin.stats();
        document.getElementById("stat-teachers").textContent = stats.teachersCount;
        document.getElementById("stat-students").textContent = stats.studentsCount;
        document.getElementById("stat-courses").textContent = stats.coursesCount;
        
        const act = await admin.activities();
        renderActivities(act.activities);
    } catch(err) {
        showToast("Failed to load dashboard stats.", "error");
    }
}

async function loadTeachers() {
    try {
        const data = await admin.getTeachers();
        const tbody = document.getElementById("teachers-tbody");
        if (data.teachers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No teachers found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.teachers.map(t => `
            <tr>
                <td>
                  <div class="user-block">
                    <div class="user-avatar">${t.full_name ? t.full_name.charAt(0).toUpperCase() : 'T'}</div>
                    <span class="user-name">${t.full_name || 'N/A'}</span>
                  </div>
                </td>
                <td>${t.email}</td>
                <td>${t.subject || '-'}</td>
                <td>
                    <button class="btn-ghost btn-sm remove-teacher-btn" data-id="${t.id}" style="color:var(--danger)">Remove</button>
                </td>
            </tr>
        `).join("");

        // Attach event listeners to remove buttons
        document.querySelectorAll(".remove-teacher-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                if (confirm("Are you sure you want to remove this teacher?")) {
                    try {
                        const btnEl = e.currentTarget;
                        btnEl.disabled = true;
                        btnEl.textContent = "Removing...";
                        await admin.removeTeacher(btnEl.dataset.id);
                        showToast("Teacher removed successfully.");
                        loadTeachers();
                        loadStats();
                    } catch(err) {
                        showToast("Failed to remove teacher.", "error");
                    }
                }
            });
        });
    } catch(err) {
        showToast("Failed to load teachers.", "error");
    }
}

/* Announcements */
async function loadAnnouncements() {
    try {
      const data = await announcements.list();
      const feed = document.getElementById("admin-announcements-feed");
      
      if (!data.announcements || data.announcements.length === 0) {
        feed.innerHTML = '<div class="empty-state-sm">No announcements posted yet.</div>';
        return;
      }
      
      feed.innerHTML = data.announcements.map(ann => `
        <div class="announcement-card">
          <div class="announcement-title">${ann.title}</div>
          <p class="announcement-desc">${ann.content}</p>
          <div class="announcement-meta">Posted by system • ${formatDate(ann.created_at)}</div>
        </div>
      `).join("");
    } catch(err) {
      showToast("Failed to load announcements.", "error");
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item[data-section]");
    const sections = document.querySelectorAll(".section");

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const sectionName = item.dataset.section;
            
            navItems.forEach(nav => nav.classList.remove("active"));
            item.classList.add("active");
            
            sections.forEach(sec => sec.classList.remove("active"));
            document.getElementById(`section-${sectionName}`).classList.add("active");
            
            if (sectionName === "dashboard") loadStats();
            else if (sectionName === "teachers") loadTeachers();
            else if (sectionName === "announcements") loadAnnouncements();
            
            // Close mobile sidebar
            document.body.classList.remove('sidebar-open');
        });
    });

    document.getElementById("sidebar-toggle").addEventListener("click", () => {
        document.body.classList.toggle('sidebar-open');
    });

    document.getElementById("sidebar-inner-collapse").addEventListener("click", () => {
        document.body.classList.remove('sidebar-open');
    });

    document.getElementById("topnav-logout").addEventListener("click", () => {
        auth.logout();
    });
}

function setupTeacherModal() {
    const modal = document.getElementById("add-teacher-modal");
    const openBtn = document.getElementById("btn-add-teacher");
    const closeBtn = document.getElementById("close-teacher-modal");
    const cancelBtn = document.getElementById("cancel-teacher-btn");
    const saveBtn = document.getElementById("save-teacher-btn");
    const errSpan = document.getElementById("teacher-error");

    const clearVals = () => {
        document.getElementById("teacher-first").value = '';
        document.getElementById("teacher-last").value = '';
        document.getElementById("teacher-email").value = '';
        document.getElementById("teacher-pass").value = '';
        document.getElementById("teacher-subject").value = '';
        errSpan.textContent = '';
    };

    const closeModal = () => {
        modal.classList.remove("active");
        clearVals();
    };

    openBtn.addEventListener("click", () => modal.classList.add("active"));
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    saveBtn.addEventListener("click", async () => {
        const first_name = document.getElementById("teacher-first").value.trim();
        const last_name = document.getElementById("teacher-last").value.trim();
        const email = document.getElementById("teacher-email").value.trim();
        const password = document.getElementById("teacher-pass").value;
        const subject = document.getElementById("teacher-subject").value.trim();

        if (!first_name || !last_name || !email || !password || !subject) {
            errSpan.textContent = "Please fill in all fields.";
            return;
        }
        if (password.length < 6) {
            errSpan.textContent = "Password must be at least 6 characters.";
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
        errSpan.textContent = '';

        try {
            await admin.addTeacher({ first_name, last_name, email, password, subject });
            showToast("Teacher added successfully!", "success");
            closeModal();
            loadTeachers();
            loadStats();
        } catch(err) {
            errSpan.textContent = err.message || "Failed to add teacher.";
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Add Teacher";
        }
    });
}

// Dark Mode Toggling
function setupTheme() {
    const toggle = document.getElementById('dark-mode-toggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const stored = localStorage.getItem('dsc_theme');
    
    if (stored === 'dark' || (!stored && prefersDark)) {
        document.body.classList.add('dark-mode');
    }

    toggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('dsc_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
}

function initDashboard() {
    setupTheme();
    setupNavigation();
    setupTeacherModal();
    loadStats();
}

window.addEventListener("DOMContentLoaded", checkAuth);
