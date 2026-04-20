/* student/attendance.js — Attendance logic: ring chart, subject cards, and timeline. */

import { attendance } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate, animateCounter } from "../shared/helpers.js";
import { cardSkeleton, listSkeleton } from "../shared/skeleton.js";

const ATT_CIRC_LG = 527.79;
const ATT_CIRC_SM = 201.06;

function attColorClass(pct) {
  if (pct >= 75) return "good";
  if (pct >= 60) return "warning";
  return "danger";
}

function attStrokeColor(cls) {
  return cls === "good" ? "#10b981" : cls === "warning" ? "#f59e0b" : "#ef4444";
}

export async function fetchAttendance() {
  // Cache-first
  if (state.attendanceLoaded && state.cachedAttendance) {
    const { summary, subjects, recent } = state.cachedAttendance;
    renderAttHeroRing(summary.pct, summary.present, summary.absent, summary.total, subjects.length);
    renderDashMiniRing(summary.pct);
    renderSubjectCards(subjects);
    renderTimeline(recent);
    return;
  }

  const arc = $("att-ring-arc");
  if (arc) arc.setAttribute("stroke-dashoffset", ATT_CIRC_LG);
  $("att-ring-pct").textContent    = "—";
  $("att-ring-footer").innerHTML   = `<span>Loading…</span>`;
  $("att-subject-cards").innerHTML = cardSkeleton(3);
  $("att-timeline").innerHTML      = listSkeleton(5);

  ["att-tile-present-num","att-tile-absent-num","att-tile-total-num"].forEach(id => {
    const el = $(id); if (el) el.textContent = "—";
  });
  if ($("att-alert-tile")) $("att-alert-tile").classList.add("hidden");

  try {
    const data = await attendance.studentOverview();
    if (!data.summary || data.summary.total === 0) { renderEmptyAttendance(); return; }

    state.cachedAttendance = data;
    state.attendanceLoaded = true;

    const { summary, subjects, recent } = data;
    renderAttHeroRing(summary.pct, summary.present, summary.absent, summary.total, subjects.length);
    renderDashMiniRing(summary.pct);
    renderSubjectCards(subjects);
    renderTimeline(recent);
  } catch (err) {
    console.error("Attendance error:", err.message);
    $("att-ring-pct").textContent    = "Err";
    $("att-ring-footer").innerHTML   = `<span style="color:#ef4444">${escapeHtml(err.message)}</span>`;
    $("att-subject-cards").innerHTML = `<div class="empty-state-sm" style="color:var(--red)">Error: ${escapeHtml(err.message)}</div>`;
    $("att-timeline").innerHTML      = `<div class="empty-state-sm">Could not load sessions.</div>`;
  }
}

function renderAttHeroRing(pct, present, absent, total, subjectCount) {
  const arc    = $("att-ring-arc");
  const pctEl  = $("att-ring-pct");
  const footer = $("att-ring-footer");
  const glow   = $("att-ring-glow");
  const cls    = attColorClass(pct);
  const color  = attStrokeColor(cls);
  const offset = ATT_CIRC_LG - (pct / 100) * ATT_CIRC_LG;

  arc.setAttribute("stroke", color);
  arc.setAttribute("stroke-dashoffset", ATT_CIRC_LG);
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", offset)));

  if (glow) { glow.classList.remove("danger","warning"); if (cls !== "good") glow.classList.add(cls); }

  let displayed = 0;
  const ticker = setInterval(() => { displayed = Math.min(displayed + 2, pct); pctEl.textContent = `${displayed}%`; if (displayed >= pct) clearInterval(ticker); }, 18);

  footer.innerHTML = `${present} present · ${absent} absent · ${total} total`;
  animateCounter($("att-tile-present-num"), present);
  animateCounter($("att-tile-absent-num"),  absent);
  animateCounter($("att-tile-total-num"),   total);
  if ($("att-tile-subjects-num")) $("att-tile-subjects-num").textContent = `${subjectCount} subject${subjectCount !== 1 ? "s" : ""}`;

  setTimeout(() => {
    const pBar = $("att-tile-present-bar"), aBar = $("att-tile-absent-bar");
    if (pBar) pBar.style.width = total > 0 ? `${Math.round((present/total)*100)}%` : "0%";
    if (aBar) aBar.style.width = total > 0 ? `${Math.round((absent/total)*100)}%`  : "0%";
  }, 80);

  const alertTile = $("att-alert-tile"), alertMsg = $("att-alert-msg");
  if (alertTile && alertMsg) {
    if (pct < 60)      { alertMsg.textContent = `⚠️ Critical! Attendance ${pct}% is below 60%.`; alertTile.classList.remove("hidden"); }
    else if (pct < 75) { alertMsg.textContent = `⚠️ Warning! Attendance ${pct}% is below 75%.`;  alertTile.classList.remove("hidden"); }
    else               { alertTile.classList.add("hidden"); }
  }
}

export function renderDashMiniRing(pct) {
  const arc = $("dash-att-arc"), pctEl = $("dash-att-pct");
  if (!arc || !pctEl) return;
  const cls = attColorClass(pct), color = attStrokeColor(cls);
  const offset = ATT_CIRC_SM - (pct / 100) * ATT_CIRC_SM;
  arc.setAttribute("stroke", color);
  requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute("stroke-dashoffset", offset)));
  let displayed = 0;
  const ticker = setInterval(() => { displayed = Math.min(displayed + 2, pct); pctEl.textContent = `${displayed}%`; if (displayed >= pct) clearInterval(ticker); }, 18);
}

function renderSubjectCards(subjects) {
  const container = $("att-subject-cards");
  if (!subjects.length) { container.innerHTML = `<div class="empty-state">No subject data found.</div>`; return; }

  container.innerHTML = subjects.map((s, i) => {
    const cls = attColorClass(s.pct);
    return `
      <div class="att-subject-card" style="animation-delay:${i * 0.07}s">
        <div class="att-subject-card-top">
          <div class="att-subject-name">${escapeHtml(s.name)}</div>
          <span class="att-subject-pill ${cls}">${cls === "good" ? "✓ Good" : cls === "warning" ? "⚠ Low" : "✗ Critical"}</span>
        </div>
        <div class="att-subject-pct-row">
          <div class="att-subject-pct-big ${cls}" data-target="${s.pct}">0%</div>
          <div class="att-subject-fraction">${s.present}/${s.total} classes</div>
        </div>
        <div class="att-subject-bar-track"><div class="att-subject-bar-fill ${cls}" data-width="${s.pct}" style="width:0%"></div></div>
        <div class="att-subject-counts">
          <span style="color:var(--green);font-weight:600">${s.present} present</span>
          <span style="color:var(--red);font-weight:600">${s.total - s.present} absent</span>
        </div>
      </div>`;
  }).join("");

  setTimeout(() => {
    container.querySelectorAll(".att-subject-bar-fill").forEach(el => { el.style.width = el.dataset.width + "%"; });
    container.querySelectorAll(".att-subject-pct-big").forEach(el => {
      const target = parseInt(el.dataset.target); let v = 0;
      const t = setInterval(() => { v = Math.min(v + 2, target); el.textContent = `${v}%`; if (v >= target) clearInterval(t); }, 16);
    });
  }, 60);
}

function renderTimeline(recent) {
  const container = $("att-timeline"), countEl = $("att-recent-count");
  if (countEl) countEl.textContent = `Last ${recent.length} classes`;
  if (!recent.length) { container.innerHTML = `<div class="empty-state-sm">No recent classes.</div>`; return; }
  container.innerHTML = recent.map((s, i) => `
    <div class="att-timeline-item ${s.status || "absent"}" style="animation-delay:${i * 0.04}s">
      <div class="att-timeline-card">
        <div class="att-timeline-left">
          <div class="att-timeline-subject">${escapeHtml(s.subject)}</div>
          <div class="att-timeline-date">${formatDate(s.date)}</div>
        </div>
        <span class="att-timeline-badge ${s.status || "absent"}">${s.status || "absent"}</span>
      </div>
    </div>
  `).join("");
}

function renderEmptyAttendance() {
  $("att-ring-pct").textContent     = "0%";
  $("att-ring-footer").innerHTML    = `<span>No attendance data recorded yet.</span>`;
  $("att-subject-cards").innerHTML  = `<div class="empty-state">No subject records found.</div>`;
  $("att-timeline").innerHTML       = `<div class="empty-state-sm">No sessions recorded yet.</div>`;
  ["att-tile-present-num","att-tile-absent-num","att-tile-total-num"].forEach(id => { const el = $(id); if (el) el.textContent = "0"; });
}

export async function loadDashAttendancePreview() {
  // If attendance already cached, use it
  if (state.cachedAttendance?.summary?.total > 0) {
    renderDashMiniRing(state.cachedAttendance.summary.pct);
    return;
  }
  try {
    const data = await attendance.studentOverview();
    if (data?.summary?.total > 0) {
      state.cachedAttendance = data;
      state.attendanceLoaded = true;
      renderDashMiniRing(data.summary.pct);
    }
  } catch (e) { console.warn("Dashboard attendance preview:", e.message); }
}
