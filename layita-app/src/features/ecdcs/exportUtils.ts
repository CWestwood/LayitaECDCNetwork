import type { EcdcWithPractitioners } from './api/types';

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function exportReportAsPDF(
  drawerBodyEl: HTMLElement,
  filenamePrefix = 'ecdc-report',
) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(drawerBodyEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentW = pageW - margin * 2;
  const imgH = (canvas.height / canvas.width) * contentW;

  let y = margin;
  let remainingH = imgH;

  // Slice the image across pages if it's taller than one page
  while (remainingH > 0) {
    const sliceH = Math.min(remainingH, pageH - margin * 2);
    pdf.addImage(imgData, 'PNG', margin, y, contentW, imgH, '', 'FAST', 0);
    // Clip to one page height by drawing a white rect over the overflow
    if (remainingH > pageH - margin * 2) {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, pageH - margin, pageW, margin + 10, 'F');
      pdf.addPage();
    }
    remainingH -= sliceH;
    y = margin;
  }

  pdf.save(`${filenamePrefix}-${today()}.pdf`);
}

// ─── Excel export ─────────────────────────────────────────────────────────────

export async function exportReportAsExcel(
  selectedEcdcs: EcdcWithPractitioners[],
  lastVisitMap: Map<string, string> | null,
) {
  const XLSX = await import('xlsx');
  const rows: Record<string, string>[] = [];

  for (const ecdc of selectedEcdcs) {
    for (const p of ecdc.practitioners ?? []) {
      rows.push({
        'Centre Name':    ecdc.name    ?? '',
        'Area':           ecdc.area    ?? '',
        'Practitioner':   p.name       ?? '',
        'Group':          p.group?.group_name ?? '',
        'Contact 1':      p.contact_number1  ?? '',
        'Contact 2':      p.contact_number2  ?? '',
        'Last Visit':     lastVisitMap?.get(p.id) ?? 'Never',
      });
    }

    // If a centre has no practitioners, still emit a row for the centre itself
    if (!ecdc.practitioners?.length) {
      rows.push({
        'Centre Name':  ecdc.name ?? '',
        'Area':         ecdc.area ?? '',
        'Practitioner': '',
        'Group':        '',
        'Contact 1':    '',
        'Contact 2':    '',
        'Last Visit':   '',
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Selected ECDCs');

  // Auto-fit column widths
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => (r[key] ?? '').length)) + 2,
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `ecdc-report-${today()}.xlsx`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
