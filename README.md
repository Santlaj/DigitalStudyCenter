<p align="center">
  <img src="./icon.png" alt="DigitalStudyCenter Logo" width="300" height="200" style="border-radius: 20px;" />
</p>

<h1 align="center">📚 DigitalStudyCenter</h1>

<p align="center">
  <strong>A modern, full-stack academic management platform built for students and teachers.</strong>
</p>

<p align="center">
  <a href="https://digitalstudycenter.in">
    <img src="https://img.shields.io/badge/🌐_Live-digitalstudycenter.in-4f46e5?style=for-the-badge" alt="Live Site" />
  </a>
  &nbsp;
  <img src="https://img.shields.io/badge/Version-1.0.0-10b981?style=for-the-badge" alt="Version" />
  &nbsp;
  <img src="https://img.shields.io/badge/License-Proprietary-ef4444?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
</p>

---

## ✨ Overview

**DigitalStudyCenter** is a comprehensive academic management platform designed for coaching centers and educational institutions. It provides role-based dashboards for **Students** and **Teachers** with real-time data synchronization, secure authentication, and a beautiful responsive UI.

> 🎯 Built as a freelance project — designed, developed, and deployed end-to-end by **Santlaj Kumar Mehta**.

---

## 🖥️ Key Features

### 🎓 Student Portal

| Feature | Description |
|---|---|
| **Dashboard** | Personalized stats — attendance %, upcoming deadlines, fee status, course overview |
| **Notes** | Browse & download PDF study materials uploaded by teachers |
| **Assignments** | View assignments with countdown timers, submit files before deadline |
| **Attendance** | Interactive ring charts, subject-wise breakdown, session timeline |
| **Fees** | Current payment status, month-by-month fee history with receipts |
| **Courses** | Visual course cards with teacher info and material counts |
| **Announcements** | Real-time announcements feed from teachers |
| **Profile** | View and update personal information |

### 👩‍🏫 Teacher Portal

| Feature | Description |
|---|---|
| **Dashboard** | Stats overview — student count, notes uploaded, assignments posted |
| **Upload Notes** | Drag-and-drop PDF upload with progress bar, class targeting |
| **My Notes** | Manage uploaded notes — search, view download counts, delete |
| **Assignments** | Create assignments with deadlines, view student submissions |
| **Students** | Full student roster — add students, toggle fees status, activate/deactivate |
| **Analytics** | Interactive Chart.js visualizations — downloads, activity, submissions |
| **Attendance** | Mark attendance with toggle switches, summary bars, session history |
| **Announcements** | Post class-targeted announcements to student feeds |
| **Profile** | Update teacher profile, subject, and bio |

### 🔐 Security & Authentication

| Feature | Description |
|---|---|
| **JWT Auth** | Secure token-based authentication via Supabase Auth |
| **Token Refresh** | Automatic access token renewal with deduplication |
| **Role-Based Access** | Separate student, teacher, and admin roles with route guards |
| **Rate Limiting** | Global, auth, and upload rate limiters to prevent abuse |
| **Input Validation** | Express-validator on all API endpoints |
| **Security Headers** | Helmet.js for HTTP security headers |
| **CORS** | Whitelist-based origin validation |

---

## 🏗️ Architecture

```
DigitalStudyCenter/
│
├── 📄 index.html                  # Entry redirect
├── 📄 login.html                  # Multi-role login + forgot password
├── 📄 student-portal.html         # Student dashboard SPA
├── 📄 teacher-portal.html         # Teacher dashboard SPA
│
├── 📁 css/
│   ├── style.css                  # Login page styles
│   ├── student-dashboard.css      # Student portal styles
│   └── teacher-dashboard.css      # Teacher portal styles
│
├── 📁 js/
│   ├── api.js                     # Centralized API client + auth
│   ├── script.js                  # Login page logic
│   │
│   ├── 📁 shared/
│   │   └── helpers.js             # DOM utilities, formatters, escapeHtml
│   │
│   ├── 📁 student/                # Student portal modules
│   │   ├── index.js               # Entry point & navigation
│   │   ├── boot.js                # Auth guard & profile init
│   │   ├── state.js               # Centralized state management
│   │   ├── dashboard.js           # Dashboard stats & recent items
│   │   ├── notes.js               # Notes table & downloads
│   │   ├── assignments.js         # Assignment list & submissions
│   │   ├── attendance.js          # Attendance visualization
│   │   ├── fees.js                # Fee status & history
│   │   ├── courses.js             # Course cards
│   │   ├── announcements.js       # Announcements feed
│   │   ├── profile.js             # Profile management
│   │   └── chart.js               # Chart initialization
│   │
│   └── 📁 teacher/                # Teacher portal modules
│       ├── index.js               # Entry point & navigation
│       ├── boot.js                # Auth guard & profile init
│       ├── state.js               # Centralized state management
│       ├── dashboard.js           # Dashboard stats
│       ├── notes.js               # Upload & manage notes
│       ├── assignments.js         # Create & manage assignments
│       ├── students.js            # Student management
│       ├── analytics.js           # Chart.js analytics
│       ├── attendance.js          # Attendance marking
│       ├── announcements.js       # Post announcements
│       └── profile.js             # Profile management
│
└── 📁 server/                     # Express.js REST API
    ├── server.js                  # App entry point
    ├── 📁 lib/
    │   ├── supabase.js            # Supabase client (admin + per-request)
    │   └── cache.js               # In-memory cache (node-cache)
    ├── 📁 middleware/
    │   ├── auth.js                # JWT authentication + role guard
    │   ├── rateLimiter.js         # Rate limiting config
    │   └── validate.js            # Input validation schemas
    └── 📁 routes/
        ├── auth.js                # Login, logout, forgot password, OTP
        ├── dashboard.js           # Aggregated dashboard summary
        ├── notes.js               # CRUD notes + file upload
        ├── assignments.js         # CRUD assignments + submissions
        ├── users.js               # Student management + profiles
        ├── attendance.js          # Attendance sessions + records
        ├── fees.js                # Fee status management
        ├── courses.js             # Course listings
        ├── announcements.js       # Announcement CRUD
        └── analytics.js           # Teacher analytics data
```

---

## 🛠️ Tech Stack

<table>
<tr>
<td align="center" width="50%">

### Frontend
| Technology | Purpose |
|---|---|
| **HTML5** | Semantic page structure |
| **CSS3** | Custom responsive styling, dark mode, animations |
| **Vanilla JavaScript** | ES Modules, no framework dependency |
| **Chart.js** | Interactive analytics charts |

</td>
<td align="center" width="50%">

### Backend
| Technology | Purpose |
|---|---|
| **Node.js** | Runtime environment |
| **Express.js** | REST API framework |
| **Supabase** | PostgreSQL + Auth + Storage |
| **Helmet** | Security headers |
| **node-cache** | In-memory caching |

</td>
</tr>
</table>

---

## 🌐 Deployment

| Component | Platform | URL |
|---|---|---|
| **Frontend** | GitHub Pages | [digitalstudycenter.in](https://digitalstudycenter.in) |
| **Backend API** | Render | Private |
| **Database** | Supabase (PostgreSQL) | Private |
| **File Storage** | Supabase Storage | Private |
| **Domain** | Custom | `digitalstudycenter.in` |

---

## 🎨 UI Highlights

- 🌗 **Dark Mode** — Full dark theme toggle with localStorage persistence
- 📱 **Responsive** — Collapsible sidebar, mobile-optimized layouts
- ✨ **Micro-animations** — Smooth transitions, animated counters, loading states
- 🎯 **Cache-first Strategy** — Instant re-renders from cached state on navigation
- 🔔 **Toast Notifications** — Non-intrusive success/error feedback
- 📊 **Interactive Charts** — Line, bar, and doughnut charts for analytics
- 📎 **Drag & Drop** — File upload with drag-and-drop zone
- 🔒 **Auth Guard** — Spinner overlay during session verification

---

## ⚡ Performance Optimizations

- **Dashboard Summary API** — Single endpoint returns all dashboard data to reduce request count
- **In-memory caching** — Server-side caching with `node-cache` (60s TTL)
- **Client-side state caching** — Loaded sections re-render from memory, skip API calls
- **Pagination** — "Load More" pattern for large datasets (20 items per page)
- **Token deduplication** — Concurrent refresh token requests are coalesced into one
- **Visibility API** — Background sync pauses when tab is hidden, resumes on focus

---

## 👤 Author

<table>
<tr>
<td>

**Santlaj Kumar Mehta**

🔗 GitHub: [@Santlaj](https://github.com/Santlaj)

</td>
</tr>
</table>

---

## 📄 License

This project is **proprietary software**. All rights reserved.
See [LICENSE](./LICENSE) for full terms.

> ⚠️ **No part of this software may be copied, modified, distributed, or used without explicit written permission from the author.**

---

<p align="center">
  <sub>Built with ❤️ by Santlaj Kumar Mehta · © 2026 DigitalStudyCenter</sub>
</p>
