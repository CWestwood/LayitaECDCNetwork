import type { EcdcWithPractitioners } from './api/types';

// ─── PDF export ───────────────────────────────────────────────────────────────

export async function exportReportAsPDF(drawerBodyEl: HTMLElement) {
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

  pdf.save(`ecdc-report-${today()}.pdf`);
}

// ─── Spreadsheet-safe CSV export ─────────────────────────────────────────────

export function exportReportAsCsv(
  selectedEcdcs: EcdcWithPractitioners[],
  lastVisitMap: Map<string, string> | null,
) {
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

  const headings = Object.keys(rows[0] ?? {
    'Centre Name': '', Area: '', Practitioner: '', Group: '',
    'Contact 1': '', 'Contact 2': '', 'Last Visit': '',
  });
  const csv = [
    headings.map(csvCell).join(','),
    ...rows.map((row) => headings.map((heading) => csvCell(row[heading] ?? '')).join(',')),
  ].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ecdc-report-${today()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
