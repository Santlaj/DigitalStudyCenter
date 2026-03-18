/**
 * student/chart.js
 * Activity chart (dashboard) for student portal.
 */

import { analytics } from "../api.js";
import { state } from "./state.js";
import { $ } from "../shared/helpers.js";

export async function loadActivityChart() {
  if (state.chartInitialised) return;
  state.chartInitialised = true;

  try {
    const data = await analytics.student();

    new Chart($("chart-activity").getContext("2d"), {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          { label: "Downloads",  data: data.downloads,   backgroundColor: "rgba(16,185,129,0.7)",  borderRadius: 6, borderSkipped: false },
          { label: "Submissions", data: data.submissions, backgroundColor: "rgba(79,70,229,0.65)", borderRadius: 6, borderSkipped: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "top", labels: { font: { size: 12 }, padding: 16, usePointStyle: true } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0, font: { size: 11 } } },
        },
      },
    });
  } catch (err) { console.warn("Chart error:", err.message); }
}
