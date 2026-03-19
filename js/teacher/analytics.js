/**
 * teacher/analytics.js
 * Dashboard charts for teacher portal.
 */

import { analytics } from "../api.js";
import { state } from "./state.js";
import { $ } from "../shared/helpers.js";

export async function loadAnalytics() {
  if (state.chartsInitialised) return;
  state.chartsInitialised = true;

  try {
    const data = await analytics.teacher();
    const PALETTE = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
    const baseOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

    new Chart($("chart-downloads").getContext("2d"), {
      type: "line",
      data: { labels: data.labels, datasets: [{ label: "Downloads", data: data.downloads, borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.08)", borderWidth: 2.5, pointBackgroundColor: "#4f46e5", pointRadius: 4, fill: true, tension: 0.4 }] },
      options: { ...baseOpts, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 } } } } },
    });

    new Chart($("chart-activity").getContext("2d"), {
      type: "bar",
      data: { labels: data.labels, datasets: [{ label: "New Students", data: data.studentActivity, backgroundColor: "rgba(16,185,129,0.75)", borderRadius: 6, borderSkipped: false }] },
      options: { ...baseOpts, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0, font: { size: 11 } } } } },
    });

    new Chart($("chart-submissions").getContext("2d"), {
      type: "doughnut",
      data: { labels: data.subjectLabels.length ? data.subjectLabels : ["No data"], datasets: [{ data: data.subjectValues.length ? data.subjectValues : [1], backgroundColor: data.subjectValues.length ? PALETTE.slice(0, data.subjectLabels.length) : ["#e2e8f0"], borderWidth: 2, borderColor: "#fff", hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: true, position: "bottom", labels: { font: { size: 11 }, padding: 14 } } } },
    });
  } catch (err) { console.warn("Analytics error:", err.message); }
}
