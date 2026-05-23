export interface EmailData {
  [key: string]: string;
}

export interface ParseResult {
  emails: string[];
  data: EmailData[];
  skipped: number;
  invalidEmails: string[];
}

// Handles quoted fields: `"Smith, Jr",john@x.com` → ["Smith, Jr", "john@x.com"]
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

export function parseCSVWithHeaders(content: string): ParseResult {
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return { emails: [], data: [], skipped: 0, invalidEmails: [] };
  }

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const allEmailsInContent = content.match(EMAIL_REGEX) || [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const emailIndex = headers.findIndex(
    h => h === 'email' || h === 'e-mail' || h === 'mail' || h.includes('email')
  );

  const emails: string[] = [];
  const data: EmailData[] = [];
  const seen = new Set<string>();
  const invalidEmails: string[] = [];
  let skipped = 0;

  if (emailIndex === -1) {
    // No header row — treat every line (or regex match) as a plain email
    const rawList =
      allEmailsInContent.length > 0
        ? allEmailsInContent
        : lines.filter(l => isValidEmail(l.trim()));

    for (const raw of rawList) {
      const email = raw.toLowerCase().trim();
      if (!isValidEmail(email)) { invalidEmails.push(raw); continue; }
      if (seen.has(email))      { skipped++;               continue; }
      seen.add(email);
      emails.push(email);
      data.push({ email });
    }
    return { emails, data, skipped, invalidEmails };
  }

  // Header row present — parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const email = values[emailIndex]?.toLowerCase().trim();

    if (!email)              { continue; }
    if (!isValidEmail(email)){ invalidEmails.push(email); continue; }
    if (seen.has(email))     { skipped++;                 continue; }

    seen.add(email);
    const row: EmailData = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx]?.trim() ?? '';
    });
    data.push(row);
    emails.push(email);
  }

  // Fallback: if header parsing found nothing, use regex
  if (emails.length === 0 && allEmailsInContent.length > 0) {
    for (const raw of allEmailsInContent) {
      const email = raw.toLowerCase();
      if (seen.has(email)) { skipped++; continue; }
      seen.add(email);
      emails.push(email);
      data.push({ email });
    }
  }

  return { emails, data, skipped, invalidEmails };
}

export function personalizeEmail(template: string, data: EmailData): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const found = Object.keys(data).find(k => k.toLowerCase() === key.toLowerCase());
    return found ? data[found] : '';
  });
}
