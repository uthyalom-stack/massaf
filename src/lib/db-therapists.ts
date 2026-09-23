import { db } from '@/lib/db';
import { CustomerTherapist, TherapistService as PublicTherapistService, TherapistScheduleWindow } from '@/types/customer';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function format24hTo12h(time24: string): string {
  if (!time24) return '';
  const parts = time24.split(':');
  let hh = parseInt(parts[0], 10);
  const mm = parts[1] || '00';
  if (isNaN(hh)) return time24;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 === 0 ? 12 : hh % 12;
  return `${hh}:${mm} ${ampm}`;
}

export function formatDaysRange(dayIndices: number[]): string {
  if (dayIndices.length === 0) return '';
  const sorted = Array.from(new Set(dayIndices)).sort((a, b) => a - b);

  let isConsecutive = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isConsecutive = false;
      break;
    }
  }

  if (isConsecutive && sorted.length > 2) {
    return `${DAY_NAMES[sorted[0]]} – ${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }

  if (sorted.length === 2 && sorted[1] === sorted[0] + 1) {
    return `${DAY_SHORT_NAMES[sorted[0]]} & ${DAY_SHORT_NAMES[sorted[1]]}`;
  }

  return sorted.map((idx) => DAY_SHORT_NAMES[idx]).join(', ');
}

interface RawAvailability {
  id: string;
  dayOfWeek: number | null;
  specificDate: Date | null;
  startTime: string;
  endTime: string;
  isUnavailable: boolean;
}

export function formatAvailabilitiesToSchedule(
  availabilities: RawAvailability[]
): TherapistScheduleWindow[] {
  const recurring = availabilities.filter(
    (a) => a.dayOfWeek !== null && !a.isUnavailable
  );

  if (recurring.length === 0) {
    return [{ days: 'By Appointment', hours: 'Flexible schedule' }];
  }

  const timeGroups: Record<string, number[]> = {};

  for (const item of recurring) {
    if (item.dayOfWeek === null) continue;
    const timeKey = `${format24hTo12h(item.startTime)} – ${format24hTo12h(item.endTime)}`;
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = [];
    }
    timeGroups[timeKey].push(item.dayOfWeek);
  }

  const windows: TherapistScheduleWindow[] = [];
  for (const [hours, days] of Object.entries(timeGroups)) {
    windows.push({
      days: formatDaysRange(days),
      hours,
    });
  }

  return windows.length > 0
    ? windows
    : [{ days: 'By Appointment', hours: 'Flexible schedule' }];
}

export interface RawTherapistService {
  id: string;
  therapistId: string;
  serviceId: string;
  customPrice: number | null;
  customDurationMinutes: number | null;
  isActive: boolean;
  service: {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    price: number;
    isActive: boolean;
  };
}

export interface RawTherapistPhoto {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface RawServiceArea {
  id: string;
  cityName: string;
  state: string;
  zipCode: string;
  endZipCode?: string | null;
}

export interface RawTherapistData {
  id: string;
  name: string;
  bio: string | null;
  profileImage: string | null;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  isHomepageSelected?: boolean;
  offersStudio: boolean;
  offersInHome: boolean;
  photos?: RawTherapistPhoto[];
  services?: RawTherapistService[];
  serviceAreas?: RawServiceArea[];
  availabilities?: RawAvailability[];
  _count?: {
    bookings: number;
  };
}

export function isZipInRange(
  requestedZip: string,
  startZip: string,
  endZip?: string | null
): boolean {
  if (!requestedZip || !startZip) return false;

  const req = requestedZip.trim();
  const start = startZip.trim();
  const end = endZip ? endZip.trim() : null;

  if (!req || !start) return false;

  if (!end) {
    return req === start;
  }

  const reqNum = parseInt(req, 10);
  const startNum = parseInt(start, 10);
  const endNum = parseInt(end, 10);

  if (!isNaN(reqNum) && !isNaN(startNum) && !isNaN(endNum)) {
    const minNum = Math.min(startNum, endNum);
    const maxNum = Math.max(startNum, endNum);
    return reqNum >= minNum && reqNum <= maxNum;
  }

  const minPad = start < end ? start : end;
  const maxPad = start < end ? end : start;

  return req >= minPad && req <= maxPad;
}

import { getZipInfo, getStateForZipSync } from '@/lib/us-locations';

export async function therapistCoversZipAsync(
  therapist: CustomerTherapist,
  requestedZip: string
): Promise<boolean> {
  if (!requestedZip || !requestedZip.trim()) return false;
  const req = requestedZip.trim();

  // Query USZipCode database info authoritatively
  const zipInfo = await getZipInfo(req);
  if (!zipInfo) {
    return false; // Customer ZIP does not exist in real U.S. database
  }

  if (therapist.rawServiceAreas && therapist.rawServiceAreas.length > 0) {
    const rangeMatch = therapist.rawServiceAreas.some((sa) => {
      if (sa.state && sa.state.trim().toUpperCase() !== zipInfo.state) {
        return false;
      }
      return isZipInRange(req, sa.zipCode, sa.endZipCode);
    });
    if (rangeMatch) return true;
  }

  // Authoritative check against automatic TherapistZipEligibility table distribution pool
  try {
    const eligibilityMatch = await db.therapistZipEligibility.findFirst({
      where: {
        therapistId: therapist.id,
        state: zipInfo.state,
      },
    });

    if (eligibilityMatch && isZipInRange(req, eligibilityMatch.startZip, eligibilityMatch.endZip)) {
      return true;
    }
  } catch {
    // Fallback if query fails
  }

  return therapist.zipCodes.some((z) => z.trim() === req);
}

export function therapistCoversZip(therapist: CustomerTherapist, requestedZip: string): boolean {
  if (!requestedZip || !requestedZip.trim()) return false;
  const req = requestedZip.trim();

  // Validate state from cache or synchronous range lookup
  const reqState = getStateForZipSync(req);
  if (reqState) {
    if (therapist.rawServiceAreas && therapist.rawServiceAreas.length > 0) {
      const match = therapist.rawServiceAreas.some((sa) => {
        if (sa.state && sa.state.trim().toUpperCase() !== reqState) {
          return false; // State mismatch rejected
        }
        return isZipInRange(req, sa.zipCode, sa.endZipCode);
      });
      if (match) return true;
    }
  }

  // Authoritative fallback matching via rawServiceAreas
  if (therapist.rawServiceAreas && therapist.rawServiceAreas.length > 0) {
    const match = therapist.rawServiceAreas.some((sa) =>
      isZipInRange(req, sa.zipCode, sa.endZipCode)
    );
    if (match) return true;
  }

  return therapist.zipCodes.some((z) => z.trim() === req);
}

export function formatDbTherapistToPublic(therapist: RawTherapistData): CustomerTherapist {
  const photos = (therapist.photos || []).sort((a, b) => a.sortOrder - b.sortOrder);

  const fallbackAvatar = '/images/default-avatar.svg';
  const mainImage = therapist.profileImage || (photos.length > 0 ? photos[0].url : fallbackAvatar);

  const galleryImages = photos.length > 0
    ? photos.map((p) => p.url)
    : [mainImage];

  const serviceAreas = therapist.serviceAreas || [];
  const uniqueCities = Array.from(
    new Set(serviceAreas.map((sa) => `${sa.cityName}, ${sa.state}`))
  );
  const zipCodes = Array.from(new Set(serviceAreas.map((sa) => sa.zipCode)));

  const location = uniqueCities.length > 0 ? uniqueCities[0] : 'United States';

  const activeServices = (therapist.services || []).filter(
    (ts) => ts.isActive && ts.service && ts.service.isActive
  );

  const formattedServices: PublicTherapistService[] = activeServices.map((ts) => ({
    id: ts.service.id,
    name: ts.service.name,
    durationMinutes: ts.customDurationMinutes ?? ts.service.durationMinutes,
    price: ts.customPrice ?? ts.service.price,
    description: ts.service.description || '',
  }));

  const prices = formattedServices.map((s) => s.price);
  const startingPrice = prices.length > 0 ? Math.min(...prices) : 0;

  const schedule = formatAvailabilitiesToSchedule(therapist.availabilities || []);

  const availabilityText = (therapist.availabilities || []).length > 0
    ? 'Appointments Available'
    : 'Schedule Available';

  const bookingCount = therapist._count?.bookings ?? 0;

  return {
    id: therapist.id,
    name: therapist.name,
    title: '',
    image: mainImage,
    galleryImages,
    rating: therapist.rating,
    reviewCount: therapist.reviewCount,
    location,
    serviceAreas: uniqueCities,
    zipCodes,
    rawServiceAreas: serviceAreas,
    startingPrice,
    availability: availabilityText,
    offersStudio: therapist.offersStudio,
    offersInHome: therapist.offersInHome,
    specialties: [],
    bio: therapist.bio || '',
    experience: '',
    approach: '',
    services: formattedServices,
    schedule,
    bookingCount,
    isFeatured: therapist.isFeatured,
    isHomepageSelected: therapist.isHomepageSelected ?? false,
  };
}

export async function getActiveTherapists(): Promise<CustomerTherapist[]> {
  try {
    const dbTherapists = await db.therapist.findMany({
      where: {
        isActive: true,
      },
      include: {
        photos: {
          orderBy: { sortOrder: 'asc' },
        },
        services: {
          where: {
            isActive: true,
            service: { isActive: true },
          },
          include: {
            service: true,
          },
        },
        serviceAreas: true,
        availabilities: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: [
        { isFeatured: 'desc' },
        { rating: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return dbTherapists.map((t) => formatDbTherapistToPublic(t));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[getActiveTherapists] Database query failed:', message);
    return [];
  }
}

export async function getActiveTherapistById(id: string): Promise<CustomerTherapist | null> {
  if (!id) return null;

  const therapist = await db.therapist.findFirst({
    where: {
      id,
      isActive: true,
    },
    include: {
      photos: {
        orderBy: { sortOrder: 'asc' },
      },
      services: {
        where: {
          isActive: true,
          service: { isActive: true },
        },
        include: {
          service: true,
        },
      },
      serviceAreas: true,
      availabilities: true,
      _count: {
        select: {
          bookings: true,
        },
      },
    },
  });

  if (!therapist) return null;
  return formatDbTherapistToPublic(therapist);
}

export interface PublicServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  description: string;
}

export async function getActiveServices(): Promise<PublicServiceOption[]> {
  try {
    const services = await db.service.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      price: s.price,
      description: s.description || '',
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[getActiveServices] Database query failed:', message);
    return [];
  }
}
