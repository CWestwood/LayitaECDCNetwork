import type { Practitioner } from './types';

export async function exportPractitionersAsExcel(
  practitioners: Practitioner[],
  lastVisitMap: Map<string, string>,
) {
  const XLSX = await import('xlsx');
  const rows = practitioners.map((practitioner) => ({
    'Centre Name': practitioner.ecdc?.name ?? '',
    'Area': practitioner.ecdc?.area ?? '',
    'Practitioner': practitioner.name ?? '',
    'Group': practitioner.group?.group_name ?? '',
    'Contact 1': practitioner.contact_number1 ?? '',
    'Contact 2': practitioner.contact_number2 ?? '',
    'Last Visit': lastVisitMap.get(practitioner.id) ?? 'Never',
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Selected Practitioners');
  worksheet['!cols'] = Object.keys(rows[0] ?? {}).map((heading) => ({
    wch: Math.max(heading.length, ...rows.map((row) => String(row[heading as keyof typeof row]).length)) + 2,
  }));
  XLSX.writeFile(workbook, `practitioner-report-${today()}.xlsx`);
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
