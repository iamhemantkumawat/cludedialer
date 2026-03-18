export function normalizePhone(input: string, defaultCountryCode = '+91') {
  const cleaned = String(input || '').trim().replace(/[^+0-9]/g, '');
  if (!cleaned) {
    return '';
  }

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('00')) {
    return `+${cleaned.slice(2)}`;
  }

  if (cleaned.length === 10) {
    return `${defaultCountryCode}${cleaned}`;
  }

  return cleaned;
}

export function parsePhoneText(rawText: string, defaultCountryCode = '+91') {
  if (!rawText) {
    return [];
  }

  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results: Array<{ phone_number: string; contact_name: string }> = [];

  for (const line of lines) {
    const cells = line.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, ''));

    if (cells.length >= 2) {
      const firstPhone = normalizePhone(cells[0], defaultCountryCode);
      const secondPhone = normalizePhone(cells[1], defaultCountryCode);

      if (firstPhone.length >= 5) {
        results.push({ phone_number: firstPhone, contact_name: cells[1] || '' });
      } else if (secondPhone.length >= 5) {
        results.push({ phone_number: secondPhone, contact_name: cells[0] || '' });
      }
      continue;
    }

    const phone = normalizePhone(line, defaultCountryCode);
    if (phone.length >= 5) {
      results.push({ phone_number: phone, contact_name: '' });
    }
  }

  return results;
}
