/* shared/skeleton.js — Modular skeleton loading components. */

export function tableSkeleton(rows = 5, cols = 5) {
  let trs = "";
  for (let i = 0; i < rows; i++) {
    let tds = "";
    for (let j = 0; j < cols; j++) {
      if (j === 0) {
        tds +=
          `
        <td>
          <div 
            style="display:flex;
            align-items:center;
            gap:10px">
            <div class="skeleton skeleton-avatar"></div>
            <div class="skeleton skeleton-line" style="width:80%; margin:0"></div>
          </div>
        </td>
        `;
      } else if (j === cols - 2) {
        tds += `
        <td>
          <div class="skeleton skeleton-pill"></div>
        </td>
        `;
      } else if (j === cols - 1) {
        tds +=
          `<td>
            <div class="skeleton skeleton-action"></div>
          </td>
        `;
      } else {
        tds +=
          `
        <td>
        <div class="skeleton skeleton-line" style="margin:0"></div>
        </td>
        `;
      }
    }
    trs += `<tr class="skeleton-tr">${tds}</tr>`;
  }
  return trs;
}

export function cardSkeleton(count = 4) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-line" style="width:70%; height:18px; margin-bottom:12px;"></div>
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line-short"></div>
      </div>
    `;
  }
  return html;
}

export function statSkeleton(count = 4) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="stat-card" style="opacity: 0.7;">
        <div class="skeleton skeleton-avatar" style="width:40px; height:40px;"></div>
        <div class="stat-body" style="flex:1;">
          <div class="skeleton skeleton-line" style="width:40px; height:24px;"></div>
          <div class="skeleton skeleton-line-short" style="margin:0;"></div>
        </div>
      </div>
    `;
  }
  return html;
}

export function listSkeleton(count = 5) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:15px;" class="skeleton-list-item">
        <div class="skeleton skeleton-avatar"></div>
        <div style="flex:1;">
          <div class="skeleton skeleton-line" style="margin-bottom:6px;"></div>
          <div class="skeleton skeleton-line-short" style="margin:0;"></div>
        </div>
      </div>
    `;
  }
  return html;
}

export function textSkeleton(lines = 3) {
  let html = '<div class="skeleton-text-block">';
  for (let i = 0; i < lines; i++) {
    html += `<div class="skeleton skeleton-line${i === lines - 1 ? '-short' : ''}"></div>`;
  }
  html += '</div>';
  return html;
}

export function detailSkeleton() {
  return `
    <div style="display:flex; flex-direction:column; gap:20px;">
      <div class="skeleton-card">
        <div class="skeleton skeleton-line" style="height:24px; width:50%; margin-bottom:15px;"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          ${textSkeleton(1)} ${textSkeleton(1)} ${textSkeleton(1)} ${textSkeleton(1)}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:20px;">
        ${cardSkeleton(4)}
      </div>
    </div>
  `;
}
