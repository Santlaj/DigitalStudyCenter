<p align="center">
  <img src="./icon1.png" alt="DigitalStudyCenter Logo" width="300" height="200" style="border-radius: 20px;" />
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
  <img src="https://img.shields.io/badge/Version-1.1.0-10b981?style=for-the-badge" alt="Version" />
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

**DigitalStudyCenter** is a comprehensive academic management platform designed for coaching centers and educational institutions. It provides role-based dashboards for **Students** and **Teachers** with real-time data synchronization, robust authentication, and a beautiful responsive UI.

> 🎯 Built as a freelance project — designed, developed, and deployed end-to-end by **Santlaj Kumar Mehta**.

---

## 🖥️ Key Features

### 🎓 Student Portal

| Feature | Description |
|---|---|
| **Dashboard** | Personalized stats — attendance %, upcoming deadlines, fee status |
| **Notes** | Browse & download PDF study materials uploaded by teachers |
| **Assignments** | View assignments with countdown timers, submit files before deadline |
| **Attendance** | Interactive ring charts, subject-wise breakdown, session timeline |
| **Fees** | Current payment status, month-by-month fee history with receipts |
| **Doubts** | Ask questions to teachers and view replies in a clean, chat-like interface |
| **Announcements** | Real-time announcements feed from teachers |
| **Profile** | View and update personal information |

### 👩‍🏫 Teacher Portal

| Feature | Description |
|---|---|
| **Dashboard** | Stats overview — student count, notes uploaded, assignments posted |
| **Upload Notes** | Drag-and-drop PDF upload with progress bar, class targeting |
| **My Notes** | Manage uploaded notes — search, view download counts, delete |
| **Assignments** | Create assignments with deadlines, view student submissions |
| **Students** | Full roster — manage student accounts, toggle fees, and control access levels |
| **Analytics** | Interactive Chart.js visualizations — downloads, activity, submissions |
| **Attendance** | Mark attendance efficiently with toggle switches and visual indicators |
| **Doubts** | Reply to student questions with organized class context |
| **Announcements** | Post class-targeted announcements to student feeds |
| **Profile** | Update teacher profile, subject, and bio |

### 🔐 Security & Authentication

| Feature | Description |
|---|---|
| **Multi-Factor Auth** | Secure onboarding and dual-layer authentication flows |
| **Session Management** | Robust token handling with strict lifecycle controls |
| **Role-Based Access** | Separate student, teacher, and admin roles with route guards |
| **Rate Limiting** | Global and route-specific limiters to ensure service stability |
| **Data Protection** | Comprehensive input validation, sanitization, and origin validation |

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
│   ├── 📁 shared/                 # Shared utilities and formatters
│   ├── 📁 student/                # Student portal modules (notes, assignments, doubts, etc.)
│   └── 📁 teacher/                # Teacher portal modules (analytics, attendance, students, etc.)
│
└── 📁 server/                     # Express.js REST API
    ├── server.js                  # App entry point
    ├── 📁 lib/                    # Core library integrations
    ├── 📁 middleware/             # Request handlers and guards
    └── 📁 routes/                 # API endpoint controllers
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
| **CSS3** | Custom responsive styling, dark mode |
| **JavaScript** | ES Modules, SPA Routing, no framework dependency |
| **Chart.js** | Interactive analytics charts |

</td>
<td align="center" width="50%">

### Backend
| Technology | Purpose |
|---|---|
| **Node.js** | Runtime environment |
| **Express.js** | REST API framework |
| **Supabase** | Managed Database + Authentication |
| **node-cache** | In-memory API caching |

</td>
</tr>
</table>

---

## 🌐 Deployment

| Component | Platform | URL |
|---|---|---|
| **Frontend** | GitHub Pages | [digitalstudycenter.in](https://digitalstudycenter.in) |
| **Backend API** | Render | Private |
| **Database** | Supabase | Private |
| **Domain** | Custom | `digitalstudycenter.in` |

---

## 🎨 UI Highlights

- 🌗 **Dark Mode** — Full dark theme toggle with localStorage persistence
- 📱 **Responsive** — Collapsible sidebar, mobile-optimized layouts
- ✨ **Micro-animations** — Smooth transitions, animated counters, loading states
- 💬 **Conversational UI** — Clean, human-readable dialogue interface for doubts
- 🔔 **Feedback Systems** — Non-intrusive toast notifications and load overlays
- 📊 **Interactive Charts** — Line, bar, and doughnut charts for analytics
- 📎 **Drag & Drop** — Intuitive file upload zones

---

## ⚡ Performance Optimizations

- **Hash-based Routing** — Enables seamless browser history and deep linking in SPA
- **Dashboard Summary API** — Single endpoint returns all dashboard data to minimize requests
- **In-memory caching** — Server-side caching for frequent read-heavy operations
- **Client-side state caching** — Loaded sections re-render from memory, skipping redundant API calls
- **Pagination** — "Load More" pattern for efficient handling of large datasets
- **Smart Sync** — Background operations pause via Visibility API when tab is hidden

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
  <sub>Built with ❤️ by Santlaj · © 2026 DigitalStudyCenter</sub>
</p>
