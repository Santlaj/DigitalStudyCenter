// js/teacher/doubts.js — Uses backend API with Redis cache
import { doubts } from '../api.js';

let currentFilter = 'all';

export function initTeacherDoubts() {
  renderTeacherDoubts();
  
  // Set up filter clicks
  const chips = document.querySelectorAll('#doubt-status-filters .filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      chips.forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.getAttribute('data-status');
      renderTeacherDoubts();
    });
  });
  
  // Expose answer function globally so onclick can find it
  window.answerDoubt = async function(doubtId) {
    const textarea = document.getElementById(`reply-${doubtId}`);
    const answer = textarea.value.trim();
    
    if (!answer) {
      alert("Please enter a reply before submitting.");
      return;
    }
    
    const btn = textarea.nextElementSibling;
    const originalText = btn.textContent;
    btn.textContent = 'Posting...';
    btn.disabled = true;

    try {
      await doubts.reply(doubtId, answer);
      renderTeacherDoubts();
    } catch (err) {
      alert("Failed to submit reply: " + err.message);
    }

    btn.textContent = originalText;
    btn.disabled = false;
  };
}

export async function renderTeacherDoubts() {
  const list = document.getElementById('teacher-doubts-list');
  if (!list) return;
  
  try {
    const res = await doubts.list();
    let allDoubts = res.doubts || [];

    // Apply filter
    if (currentFilter !== 'all') {
      allDoubts = allDoubts.filter(d => d.status === currentFilter);
    }

    if (allDoubts.length === 0) {
      list.innerHTML = `<div class="empty-state-sm" style="text-align:center; padding:20px; color:var(--text-muted);">No doubts found for this filter.</div>`;
      return;
    }
    
    let html = '';
    allDoubts.forEach(d => {
      const statusColor = d.status === 'Resolved' ? 'var(--accent)' : '#f59e0b';
      html += `
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.85rem; color:var(--text-muted);">
            <span><strong style="color:var(--text-main);">${d.subject}</strong> • Asked by <strong style="color:var(--text-main);">${d.student_name}</strong></span>
            <span style="color:${statusColor}; font-weight:700;">${d.status}</span>
          </div>
          <div style="font-size:1.05rem; margin-bottom:16px; color:var(--text-main);">${d.question}</div>
          
          ${d.status === 'Resolved' ? `
            <div style="background:var(--bg-page); padding:12px; border-left:4px solid var(--accent); border-radius:4px;">
              <strong style="display:block; margin-bottom:4px; font-size:0.85rem; color:var(--text-main);">Your Reply:</strong>
              <span style="color:var(--text-sub);">${d.answer}</span>
            </div>
          ` : `
            <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:8px;">
              <textarea id="reply-${d.id}" rows="2" placeholder="Write your answer here..." style="width:100%; padding:10px 14px; border:1.5px solid var(--border); border-radius:var(--radius-sm); font-family:inherit; resize:vertical; margin-bottom:8px; background:var(--bg-card); color:var(--text-main);"></textarea>
              <button onclick="answerDoubt('${d.id}')" class="btn-primary" style="padding:8px 16px; font-weight:600;">Post Reply</button>
            </div>
          `}
        </div>
      `;
    });
    
    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = `<div class="empty-state-sm" style="text-align:center; padding:20px; color:var(--text-muted);">Failed to load doubts.</div>`;
  }
}
