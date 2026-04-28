// js/student/doubts.js — Uses backend API with Redis cache
import { doubts } from '../api.js';

export function initDoubts() {
  const form = document.getElementById('ask-doubt-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const subject = document.getElementById('doubt-subject').value;
      const question = document.getElementById('doubt-question').value;
      
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;

      try {
        await doubts.submit(subject, question);
        form.reset();
        
        // Show inline success message
        const fb = document.getElementById('doubt-feedback');
        if (fb) {
          fb.textContent = '✓ Doubt submitted successfully!';
          fb.style.display = 'block';
          fb.style.background = 'rgba(16, 185, 129, 0.1)';
          fb.style.color = '#10b981';
          fb.style.border = '1px solid rgba(16, 185, 129, 0.2)';
          setTimeout(() => { fb.style.display = 'none'; }, 4000);
        }
        
        renderStudentDoubts();
      } catch (err) {
        const fb = document.getElementById('doubt-feedback');
        if (fb) {
          fb.textContent = '✗ ' + err.message;
          fb.style.display = 'block';
          fb.style.background = 'rgba(239, 68, 68, 0.1)';
          fb.style.color = '#ef4444';
          fb.style.border = '1px solid rgba(239, 68, 68, 0.2)';
          setTimeout(() => { fb.style.display = 'none'; }, 4000);
        }
      }

      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    });
  }
  
  renderStudentDoubts();
}

export async function renderStudentDoubts() {
  const list = document.getElementById('student-doubts-list');
  if (!list) return;
  
  try {
    const res = await doubts.list();
    const myDoubts = res.doubts || [];

    if (myDoubts.length === 0) {
      list.innerHTML = `<div class="empty-state-sm" style="text-align:center; padding:20px; color:var(--text-muted);">You haven't asked any doubts yet.</div>`;
      return;
    }
    
    let html = '';
    myDoubts.forEach(d => {
      const statusColor = d.status === 'Resolved' ? 'var(--accent)' : '#f59e0b';
      html += `
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:0.85rem; color:var(--text-muted);">
            <strong>${d.subject}</strong>
            <span style="color:${statusColor}; font-weight:700;">${d.status}</span>
          </div>
          <div style="font-size:1.05rem; margin-bottom:16px; color:var(--text-main);">${d.question}</div>
          ${d.status === 'Resolved' && d.answer ? `
            <div style="background:var(--bg-page); padding:12px; border-left:4px solid var(--accent); border-radius:4px;">
              <strong style="display:block; margin-bottom:4px; font-size:0.85rem; color:var(--text-main);">Teacher Reply:</strong>
              <span style="color:var(--text-sub);">${d.answer}</span>
            </div>
          ` : ''}
        </div>
      `;
    });
    
    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = `<div class="empty-state-sm" style="text-align:center; padding:20px; color:var(--text-muted);">Failed to load doubts.</div>`;
  }
}
