// reports.js

// Sample summary data structure
function getSampleSummary() {
  return {
    date: new Date().toLocaleDateString(),
    importantInfo: ["Project Alpha completed", "Budget approved"],
    contacts: [
      { name: "Alice Smith", email: "alice@email.com", phone: "555-1234" }
    ],
    todos: ["Send invoice to client", "Schedule team meeting"],
    events: [
      { title: "Team Meeting", date: "2024-06-01", time: "10:00 AM" }
    ]
  };
}

// Get last report's endTimestamp
function getLastReportEndTimestamp() {
  const list = getSummaryMetaList();
  return list.length > 0 ? list[0].endTimestamp : 0;
}

// Get all chat messages with timestamps
function getAllChatMessages() {
  const chatContainer = document.getElementById('chat-container');
  if (!chatContainer) return [];
  const messages = [];
  chatContainer.querySelectorAll('.message').forEach(msg => {
    const timestamp = msg.getAttribute('data-timestamp') || Date.now();
    const content = msg.textContent.trim();
    messages.push({ timestamp, content });
  });
  return messages;
}

// Get chat messages between two timestamps
function getChatMessagesBetween(start, end) {
  return getAllChatMessages().filter(msg => msg.timestamp > start && msg.timestamp <= end);
}

// Save summary metadata to localStorage
function saveSummaryMeta(meta) {
  const key = 'summaryReports';
  let list = JSON.parse(localStorage.getItem(key) || '[]');
  list.unshift(meta); // newest first
  localStorage.setItem(key, JSON.stringify(list));
  // Update last report endTimestamp
  localStorage.setItem('lastReportEndTimestamp', meta.endTimestamp);
}

// Get all saved summaries
function getSummaryMetaList() {
  return JSON.parse(localStorage.getItem('summaryReports') || '[]');
}

// Delete a report by filename
function deleteSummaryMeta(filename) {
  const key = 'summaryReports';
  let list = JSON.parse(localStorage.getItem(key) || '[]');
  list = list.filter(meta => meta.filename !== filename);
  localStorage.setItem(key, JSON.stringify(list));
}

// Generate a professional PDF from summary data
function generateSummaryPDF(summary, heading, description, type, startTimestamp, endTimestamp) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(heading || 'Personal Assistant Summary Report', 105, y, { align: 'center' });
  y += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${summary.date}`, 14, y);
  y += 8;
  if (description) {
    doc.setFont('helvetica', 'italic');
    doc.text(description, 14, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Important Information:', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  summary.importantInfo.forEach(info => {
    doc.text(`• ${info}`, 18, y);
    y += 7;
  });
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('Contact Details:', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  summary.contacts.forEach(c => {
    doc.text(`• ${c.name} (${c.email}, ${c.phone})`, 18, y);
    y += 7;
  });
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('To-Do List:', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  summary.todos.forEach(todo => {
    doc.text(`• ${todo}`, 18, y);
    y += 7;
  });
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('Scheduled Events:', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  summary.events.forEach(ev => {
    doc.text(`• ${ev.title} (${ev.date} ${ev.time})`, 18, y);
    y += 7;
  });
  // Save PDF
  const filename = `summary-${summary.date.replace(/\//g, '-')}-${Date.now()}.pdf`;
  doc.save(filename);
  // Save meta for history
  saveSummaryMeta({ filename, date: summary.date, heading, description, type, startTimestamp, endTimestamp });
}

// Render the reports list in the modal
function renderReportsList() {
  const list = getSummaryMetaList();
  const container = document.getElementById('reports-list');
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">No summary reports yet.</div>';
    return;
  }
  container.innerHTML = list.map(meta =>
    `<div class="document-item" style="background:#f9fafb;color:#222;display:flex;align-items:center;justify-content:space-between;gap:1em;">
      <div class="document-info" style="flex:1;min-width:0;">
        <div class="document-title font-bold text-lg" style="color:#2563eb;">${meta.heading || meta.filename}</div>
        <div class="document-meta text-xs" style="color:#64748b;">${meta.date} | ${meta.type === 'auto' ? 'Automatic' : 'Manual'} | ${meta.startTimestamp ? new Date(meta.startTimestamp).toLocaleString() : ''} - ${meta.endTimestamp ? new Date(meta.endTimestamp).toLocaleString() : ''}</div>
        <div class="document-desc text-sm" style="color:#444;">${meta.description || ''}</div>
      </div>
      <div class="document-actions flex gap-2">
        <button class="action-button" title="View" onclick="window.openReportModal('${meta.filename}')"><i data-lucide='eye'></i></button>
        <button class="action-button" title="Download" onclick="window.open('${meta.filename}', '_blank')"><i data-lucide='download'></i></button>
        <button class="action-button" title="Print" onclick="printReport('${meta.filename}')"><i data-lucide='printer'></i></button>
        <button class="action-button" title="Delete" style="color:#ef4444;" onclick="deleteReportAndRefresh('${meta.filename}')"><i data-lucide='trash-2'></i></button>
      </div>
    </div>`
  ).join('');
  if (window.lucide) lucide.createIcons();
}

// PDF Viewer Modal logic
window.openReportModal = function(filename) {
  const modal = document.getElementById('pdf-viewer-modal');
  const frame = document.getElementById('pdf-viewer-frame');
  if (modal && frame) {
    frame.src = filename;
    modal.classList.remove('hidden');
  }
  // Focus for accessibility
  setTimeout(() => { if (modal) modal.focus(); }, 100);
};

const closePdfBtn = document.getElementById('close-pdf-viewer');
if (closePdfBtn) {
  closePdfBtn.onclick = function() {
    const modal = document.getElementById('pdf-viewer-modal');
    const frame = document.getElementById('pdf-viewer-frame');
    if (modal && frame) {
      frame.src = '';
      modal.classList.add('hidden');
    }
  };
}

// Print PDF (open and trigger print dialog)
window.printReport = function(filename) {
  window.open(filename, '_blank').print();
};

// Delete report and refresh list
window.deleteReportAndRefresh = function(filename) {
  if (confirm('Delete this report?')) {
    deleteSummaryMeta(filename);
    renderReportsList();
  }
};

// Automatic report generation (stub)
function maybeGenerateAutomaticReport() {
  // Get frequency from settings (stub: daily)
  const frequencyMs = 24 * 60 * 60 * 1000; // daily
  const lastEnd = getLastReportEndTimestamp();
  const now = Date.now();
  if (!lastEnd || now - lastEnd > frequencyMs) {
    // Generate automatic report
    const startTimestamp = lastEnd || 0;
    const endTimestamp = now;
    const heading = 'Automatic Report';
    const description = 'Automatically generated summary.';
    const type = 'auto';
    // Get chat messages between start and end (stub)
    const messages = getChatMessagesBetween(startTimestamp, endTimestamp);
    // Use sample summary for now
    const summary = getSampleSummary();
    generateSummaryPDF(summary, heading, description, type, startTimestamp, endTimestamp);
    setTimeout(renderReportsList, 500);
  }
}

// Wire up the UI
function initReportsUI() {
  const openBtn = document.getElementById('open-reports');
  const modal = document.getElementById('reports-modal');
  const closeBtn = document.getElementById('reports-close');
  const form = document.getElementById('generate-report-form');
  const headingInput = document.getElementById('report-heading');
  const descInput = document.getElementById('report-description');
  if (openBtn && modal) {
    openBtn.onclick = () => {
      modal.classList.remove('hidden');
      renderReportsList();
    };
  }
  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.classList.add('hidden');
  }
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const heading = headingInput.value.trim();
      const description = descInput.value.trim();
      const type = 'manual';
      const lastEnd = getLastReportEndTimestamp();
      const startTimestamp = lastEnd || 0;
      const endTimestamp = Date.now();
      // Get chat messages between start and end (stub)
      const messages = getChatMessagesBetween(startTimestamp, endTimestamp);
      // Use sample summary for now
      const summary = getSampleSummary();
      generateSummaryPDF(summary, heading, description, type, startTimestamp, endTimestamp);
      setTimeout(() => {
        renderReportsList();
        form.reset();
      }, 500);
    };
  }
  // On load, check for automatic report
  // maybeGenerateAutomaticReport();
}

// Expose for main script
window.initReportsUI = initReportsUI; 