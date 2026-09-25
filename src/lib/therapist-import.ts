import { db } from '@/lib/db';
import { parseScheduleDays, parseScheduleHours } from '@/lib/availability';

export interface CsvParsedRow {
  rowNumber: number;
  name: string;
  bio: string | null;
  profileImage: string | null;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  hourlyRate: number;
  offersStudio: boolean;
  offersInHome: boolean;
  servicesRaw: string;
  matchedServiceIds: string[];
  unmatchedServices: string[];
  availabilityRaw: string;
  parsedAvailabilities: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;
  galleryPhotos: string[];
  classification: 'NEW' | 'EXISTING' | 'POSSIBLE_DUPLICATE' | 'INVALID';
  existingTherapistId?: string | null;
  existingTherapistName?: string | null;
  errors: string[];
  warnings: string[];
}

/**
 * Standard RFC 4180 compliant CSV line parser handling quoted fields, commas, and escaped quotes.
 */
export function parseCsvContent(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  const rows: string[][] = [];

  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // Skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // Skip \n
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((field) => field.length > 0));
}

function parseBooleanHeader(val: string): boolean {
  if (!val) return true;
  const clean = val.trim().toLowerCase();
  return clean === 'yes' || clean === 'true' || clean === '1' || clean === 'y';
}

function normalizeHeaderKey(header: string): string {
  const h = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (h.includes('fullname') || h === 'name' || h === 'therapistname') return 'name';
  if (h.includes('bio') || h.includes('about')) return 'bio';
  if (h.includes('profilephoto') || h.includes('avatar') || h.includes('headshot') || h === 'photo') return 'profileImage';
  if (h.includes('email')) return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('cell')) return 'phone';
  if (h.includes('telegram') || h.includes('chatid')) return 'telegramChatId';
  if (h.includes('rate') || h.includes('hourly') || h.includes('price')) return 'hourlyRate';
  if (h.includes('studio')) return 'offersStudio';
  if (h.includes('inhome') || h.includes('home')) return 'offersInHome';
  if (h.includes('service')) return 'services';
  if (h.includes('availab') || h.includes('schedule') || h.includes('hours')) return 'availability';
  if (h.includes('gallery') || h.includes('photos')) return 'galleryPhotos';
  return h;
}

/**
 * Parses multi-rule availability schedule strings like "Mon-Fri 09:00-17:00; Sat 10:00-16:00"
 */
export function parseAvailabilityScheduleString(availabilityRaw: string): {
  rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  warnings: string[];
} {
  const rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [];
  const warnings: string[] = [];

  if (!availabilityRaw || !availabilityRaw.trim()) {
    return { rules, warnings };
  }

  // Split multi-rule schedules by semicolon or newline
  const blocks = availabilityRaw.split(/[;\n]/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const parts = block.split(/\s+/);
    let daysStr = parts[0] || 'Mon-Fri';
    let hoursStr = parts[1] || '09:00-17:00';

    if (parts.length === 1 && parts[0].includes(':')) {
      daysStr = 'Mon-Fri';
      hoursStr = parts[0];
    }

    const days = parseScheduleDays(daysStr);
    const hours = parseScheduleHours(hoursStr);

    if (days.length > 0 && hours) {
      if (hours.startMinutes >= hours.endMinutes) {
        warnings.push(`Invalid time range in schedule '${block}': start time must be strictly before end time.`);
        continue;
      }

      const startHh = Math.floor(hours.startMinutes / 60).toString().padStart(2, '0');
      const startMm = (hours.startMinutes % 60).toString().padStart(2, '0');
      const endHh = Math.floor(hours.endMinutes / 60).toString().padStart(2, '0');
      const endMm = (hours.endMinutes % 60).toString().padStart(2, '0');

      for (const day of days) {
        rules.push({
          dayOfWeek: day,
          startTime: `${startHh}:${startMm}`,
          endTime: `${endHh}:${endMm}`,
        });
      }
    } else {
      warnings.push(`Could not parse schedule block '${block}'.`);
    }
  }

  return { rules, warnings };
}

/**
 * Parses and validates CSV content against database state, classifying duplicates and unmatched services.
 */
export async function parseAndPreviewTherapistCsv(csvContent: string): Promise<{
  rows: CsvParsedRow[];
  summary: {
    totalRows: number;
    newCount: number;
    existingCount: number;
    duplicateCount: number;
    invalidCount: number;
    unmatchedServices: string[];
  };
}> {
  const rawMatrix = parseCsvContent(csvContent);
  if (rawMatrix.length < 2) {
    throw new Error('CSV file is empty or missing data rows.');
  }

  const rawHeaders = rawMatrix[0];
  const headerMap = new Map<string, number>();
  rawHeaders.forEach((h, idx) => {
    const key = normalizeHeaderKey(h);
    headerMap.set(key, idx);
  });

  const getColValue = (row: string[], key: string): string => {
    const idx = headerMap.get(key);
    return idx !== undefined && row[idx] !== undefined ? row[idx] : '';
  };

  // Fetch active global services from database for mapping
  const dbServices = await db.service.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const dbServiceMap = new Map<string, string>();
  for (const s of dbServices) {
    dbServiceMap.set(s.name.trim().toLowerCase(), s.id);
  }

  // Fetch existing therapists from database for duplicate detection
  const existingTherapists = await db.therapist.findMany({
    select: { id: true, name: true, email: true, phone: true },
  });

  const emailMap = new Map<string, { id: string; name: string }>();
  const phoneMap = new Map<string, { id: string; name: string }>();
  const nameMap = new Map<string, { id: string; name: string }>();

  for (const t of existingTherapists) {
    if (t.email) emailMap.set(t.email.trim().toLowerCase(), { id: t.id, name: t.name });
    if (t.phone) {
      const cleanPhone = t.phone.replace(/[^0-9]/g, '');
      if (cleanPhone) phoneMap.set(cleanPhone, { id: t.id, name: t.name });
    }
    nameMap.set(t.name.trim().toLowerCase(), { id: t.id, name: t.name });
  }

  const parsedRows: CsvParsedRow[] = [];
  const globalUnmatchedServices = new Set<string>();

  for (let rIdx = 1; rIdx < rawMatrix.length; rIdx++) {
    const row = rawMatrix[rIdx];
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = getColValue(row, 'name').trim();
    if (!name) {
      errors.push('Full Name is required');
    }

    const emailRaw = getColValue(row, 'email').trim();
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    if (email && !email.includes('@')) {
      errors.push(`Invalid email format '${emailRaw}'`);
    }

    const phoneRaw = getColValue(row, 'phone').trim();
    const phone = phoneRaw || null;

    const bioRaw = getColValue(row, 'bio').trim();
    const bio = bioRaw || null;

    const profileImageRaw = getColValue(row, 'profileImage').trim();
    const profileImage = profileImageRaw || null;

    const telegramChatIdRaw = getColValue(row, 'telegramChatId').trim();
    const telegramChatId = telegramChatIdRaw || null;

    const hourlyRateRaw = getColValue(row, 'hourlyRate').trim();
    let hourlyRate = 100.0;
    if (hourlyRateRaw) {
      const parsedRate = parseFloat(hourlyRateRaw.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedRate) && parsedRate > 0) {
        hourlyRate = parsedRate;
      }
    }

    const offersStudioStr = getColValue(row, 'offersStudio');
    const offersStudio = offersStudioStr ? parseBooleanHeader(offersStudioStr) : true;

    const offersInHomeStr = getColValue(row, 'offersInHome');
    const offersInHome = offersInHomeStr ? parseBooleanHeader(offersInHomeStr) : true;

    // Services Mapping
    const servicesRaw = getColValue(row, 'services').trim();
    const matchedServiceIds: string[] = [];
    const unmatchedServices: string[] = [];

    if (servicesRaw) {
      const serviceTokens = servicesRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
      for (const token of serviceTokens) {
        const lowerToken = token.toLowerCase();
        if (dbServiceMap.has(lowerToken)) {
          matchedServiceIds.push(dbServiceMap.get(lowerToken)!);
        } else {
          unmatchedServices.push(token);
          globalUnmatchedServices.add(token);
          warnings.push(`Unmatched service: '${token}'`);
        }
      }
    }

    // Availability Mapping
    const availabilityRaw = getColValue(row, 'availability').trim();
    const { rules: parsedAvailabilities, warnings: availWarnings } = parseAvailabilityScheduleString(availabilityRaw);
    warnings.push(...availWarnings);

    // Gallery Photos Mapping
    const galleryPhotosRaw = getColValue(row, 'galleryPhotos').trim();
    const galleryPhotos = galleryPhotosRaw
      ? galleryPhotosRaw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      : [];

    // Classification & Duplicate Detection
    let classification: 'NEW' | 'EXISTING' | 'POSSIBLE_DUPLICATE' | 'INVALID' = 'NEW';
    let existingTherapistId: string | null = null;
    let existingTherapistName: string | null = null;

    if (errors.length > 0) {
      classification = 'INVALID';
    } else if (email && emailMap.has(email)) {
      const match = emailMap.get(email)!;
      classification = 'EXISTING';
      existingTherapistId = match.id;
      existingTherapistName = match.name;
      warnings.push(`Email '${email}' belongs to existing therapist '${match.name}'`);
    } else if (phone && phoneMap.has(phone.replace(/[^0-9]/g, ''))) {
      const match = phoneMap.get(phone.replace(/[^0-9]/g, ''))!;
      classification = 'POSSIBLE_DUPLICATE';
      existingTherapistId = match.id;
      existingTherapistName = match.name;
      warnings.push(`Phone '${phone}' matches existing therapist '${match.name}'`);
    } else if (name && nameMap.has(name.toLowerCase())) {
      const match = nameMap.get(name.toLowerCase())!;
      classification = 'POSSIBLE_DUPLICATE';
      existingTherapistId = match.id;
      existingTherapistName = match.name;
      warnings.push(`Name '${name}' matches existing therapist profile`);
    }

    parsedRows.push({
      rowNumber: rIdx + 1,
      name,
      bio,
      profileImage,
      email,
      phone,
      telegramChatId,
      hourlyRate,
      offersStudio,
      offersInHome,
      servicesRaw,
      matchedServiceIds,
      unmatchedServices,
      availabilityRaw,
      parsedAvailabilities,
      galleryPhotos,
      classification,
      existingTherapistId,
      existingTherapistName,
      errors,
      warnings,
    });
  }

  const summary = {
    totalRows: parsedRows.length,
    newCount: parsedRows.filter((r) => r.classification === 'NEW').length,
    existingCount: parsedRows.filter((r) => r.classification === 'EXISTING').length,
    duplicateCount: parsedRows.filter((r) => r.classification === 'POSSIBLE_DUPLICATE').length,
    invalidCount: parsedRows.filter((r) => r.classification === 'INVALID').length,
    unmatchedServices: Array.from(globalUnmatchedServices),
  };

  return { rows: parsedRows, summary };
}
