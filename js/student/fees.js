/**
 * student/fees.js
 * Fee payment section: current card, history table, reminder banner.
 */

import { fees } from "../api.js";
import { state } from "./state.js";
import { $, escapeHtml, formatDate } from "../shared/helpers.js";
import { tableSkeleton } from "../shared/skeleton.js";

export async function updateFeeStatCard() {
  try {
    const { fee, showReminder, currentMonth } = await fees.current();
    const card      = $("fee-stat-card");
    const badge     = $("stat-fee-status");
    const trend     = $("stat-fee-trend");
    const iconWrap  = $("fee-stat-icon-wrap");
    const status    = fee?.status || "unpaid";

    card.classList.remove("fee-paid", "fee-unpaid", "fee-pending");
    badge.classList.remove("paid", "unpaid", "pending");

    if (status === "paid") {
      card.classList.add("fee-paid"); badge.classList.add("paid"); badge.textContent = "✓ Paid";
      trend.textContent = "This month"; trend.className = "stat-trend positive";
      iconWrap.style.setProperty("--accent", "#10b981");
    } else if (status === "pending") {
      card.classList.add("fee-pending"); badge.classList.add("pending"); badge.textContent = "⏳ Pending";
      trend.textContent = "Action needed"; trend.className = "stat-trend neutral";
      iconWrap.style.setProperty("--accent", "#f59e0b");
    } else {
      card.classList.add("fee-unpaid"); badge.classList.add("unpaid"); badge.textContent = "✗ Unpaid";
      trend.textContent = "Pay now!"; trend.className = "stat-trend negative";
      iconWrap.style.setProperty("--accent", "#ef4444");
    }

    const banner = $("fee-reminder-banner");
    if (banner && showReminder) {
      const daysOver = new Date().getDate() - 5;
      $("fee-reminder-title").textContent = `⚠️ Fee Not Paid — ${daysOver > 0 ? daysOver + " day" + (daysOver > 1 ? "s" : "") + " overdue" : "Due today"}`;
      $("fee-reminder-text").textContent  = `Your fee for ${currentMonth} is unpaid.`;
      banner.classList.remove("hidden");
    } else if (banner) { banner.classList.add("hidden"); }
  } catch (e) { console.warn("Fee stat card error:", e.message); }
}

export async function fetchFeePayment() {
  // Cache-first
  if (state.feesLoaded && state.cachedFee) {
    const { fee, showReminder, currentMonth } = state.cachedFee;
    renderCurrentFeeCard(fee, currentMonth, new Date());
    const banner = $("fee-reminder-banner");
    if (showReminder) {
      const daysOver = new Date().getDate() - 5;
      $("fee-reminder-title").textContent = `Fee Not Paid — ${daysOver > 0 ? daysOver + " day" + (daysOver > 1 ? "s" : "") + " overdue" : "5 days passed"}`;
      $("fee-reminder-text").textContent  = `Your fee for ${currentMonth} is still unpaid. Please pay immediately.`;
      banner.classList.remove("hidden");
    } else { banner.classList.add("hidden"); }
    renderFeeHistory(state.cachedFeeHistory);
    return;
  }

  try {
    const feeData = await fees.current();
    state.cachedFee = feeData;
    const { fee, showReminder, currentMonth } = feeData;
    renderCurrentFeeCard(fee, currentMonth, new Date());

    const banner = $("fee-reminder-banner");
    if (showReminder) {
      const daysOver = new Date().getDate() - 5;
      $("fee-reminder-title").textContent = `Fee Not Paid — ${daysOver > 0 ? daysOver + " day" + (daysOver > 1 ? "s" : "") + " overdue" : "5 days passed"}`;
      $("fee-reminder-text").textContent  = `Your fee for ${currentMonth} is still unpaid. Please pay immediately.`;
      banner.classList.remove("hidden");
    } else { banner.classList.add("hidden"); }

    await loadFeeHistory();
    state.feesLoaded = true;
  } catch (err) { console.error("Fee payment error:", err.message); }
}

function renderCurrentFeeCard(feeRow, monthLabel, today) {
  const card       = $("fee-current-card");
  const statusBadge = $("fee-status-badge");
  const badgeText  = $("fee-badge-text");
  const paidDateEl = $("fee-paid-date");
  const dueRow     = $("fee-due-row");
  const status     = feeRow?.status || "unpaid";
  const amount     = feeRow?.amount ? `₹ ${Number(feeRow.amount).toLocaleString("en-IN")}` : "₹ —";

  $("fee-current-month").textContent = monthLabel;
  $("fee-amount-value").textContent  = amount;

  if (feeRow?.due_date) {
    const due = new Date(feeRow.due_date), isLate = due < today && status !== "paid";
    dueRow.textContent = `Due: ${formatDate(feeRow.due_date)}${isLate ? " — OVERDUE" : ""}`;
    dueRow.className   = `fee-due-row${isLate ? " overdue" : ""}`;
  } else { dueRow.textContent = `Due: 5th of every month`; dueRow.className = "fee-due-row"; }

  card.classList.remove("fee-paid","fee-unpaid","fee-pending");
  statusBadge.classList.remove("paid","unpaid","pending");
  paidDateEl.classList.add("hidden");

  if (status === "paid") {
    card.classList.add("fee-paid"); statusBadge.classList.add("paid"); badgeText.textContent = "✓ PAID";
    if (feeRow?.paid_at) { paidDateEl.textContent = `Paid on ${formatDate(feeRow.paid_at)}`; paidDateEl.classList.remove("hidden"); }
  } else if (status === "pending") {
    card.classList.add("fee-pending"); statusBadge.classList.add("pending"); badgeText.textContent = "⏳ PENDING";
  } else {
    card.classList.add("fee-unpaid"); statusBadge.classList.add("unpaid"); badgeText.textContent = "✗ UNPAID";
  }
}

async function loadFeeHistory() {
  const tbody = $("fee-history-tbody");
  tbody.innerHTML = tableSkeleton(4, 6);
  try {
    const { history } = await fees.history();
    state.allFeeRecords = history || [];
    state.cachedFeeHistory = state.allFeeRecords;
    renderFeeHistory(state.allFeeRecords);
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Error: ${escapeHtml(err.message)}</td></tr>`; }
}

function renderFeeHistory(data) {
  const tbody = $("fee-history-tbody");
  $("fee-history-count").textContent = `${data.length} record${data.length !== 1 ? "s" : ""}`;
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No fee records found yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(r => {
    const status = r.status || "unpaid";
    const pillCls = status === "paid" ? "fee-pill-paid" : status === "pending" ? "fee-pill-pending" : "fee-pill-unpaid";
    const pillIcon = status === "paid" ? "✓" : status === "pending" ? "⏳" : "✗";
    const amount = r.amount ? `₹ ${Number(r.amount).toLocaleString("en-IN")}` : "—";
    const [yr, mo] = (r.month || "").split("-");
    const mLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : r.month || "—";
    return `<tr>
      <td><strong>${escapeHtml(mLabel)}</strong></td><td>${escapeHtml(amount)}</td>
      <td><span class="pill ${pillCls}">${pillIcon} ${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span></td>
      <td>${r.due_date ? formatDate(r.due_date) : "5th of month"}</td><td>${r.paid_at ? formatDate(r.paid_at) : "—"}</td>
      <td>${r.receipt_url ? `<a class="fee-receipt-link" href="${escapeHtml(r.receipt_url)}" target="_blank" rel="noopener">📄 Receipt</a>` : `<span style="color:var(--text-muted);font-size:0.8rem">—</span>`}</td>
    </tr>`;
  }).join("");
}
