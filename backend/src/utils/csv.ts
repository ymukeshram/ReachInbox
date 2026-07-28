function csvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(','), ...rows.map(row => row.map(csvField).join(','))];
  return lines.join('\n');
}
