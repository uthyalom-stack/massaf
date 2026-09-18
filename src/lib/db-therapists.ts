import { db } from '@/lib/db';
import { MockTherapist, TherapistService as PublicTherapistService, TherapistScheduleWindow } from '@/types/customer';

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

  // Check if consecutive
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

  // Group by time range
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
  offersStudio: boolean;
  offersInHome: boolean;
  photos?: RawTherapistPhoto[];
  services?: RawTherapistService[];
  serviceAreas?: RawServiceArea[];
  availabilities?: RawAvailability[];
}

export function formatDbTherapistToPublic(therapist: RawTherapistData): MockTherapist {
  const photos = (therapist.photos || []).sort((a, b) => a.sortOrder - b.sortOrder);

  // Fallback image handling
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

  // Active services
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

  // Derive specialties from service names
  const specialtiesSet = new Set<string>();
  activeServices.forEach((ts) => {
    if (ts.service?.name) {
      specialtiesSet.add(ts.service.name);
    }
  });
  if (specialtiesSet.size === 0) {
    specialtiesSet.add('Therapeutic Massage');
  }

  const schedule = formatAvailabilitiesToSchedule(therapist.availabilities || []);

  const availabilityText = (therapist.availabilities || []).length > 0
    ? 'Appointments Available'
    : 'Schedule Available';

  return {
    id: therapist.id,
    name: therapist.name,
    title: 'Licensed Massage Therapist',
    image: mainImage,
    galleryImages,
    rating: therapist.rating,
    reviewCount: therapist.reviewCount,
    location,
    serviceAreas: uniqueCities.length > 0 ? uniqueCities : ['Local Area'],
    zipCodes,
    startingPrice,
    availability: availabilityText,
    offersStudio: therapist.offersStudio,
    offersInHome: therapist.offersInHome,
    specialties: Array.from(specialtiesSet),
    bio: therapist.bio || '',
    experience: 'Licensed & background-checked massage practitioner.',
    approach: 'Tailored therapeutic bodywork customized to client wellness goals.',
    services: formattedServices,
    schedule,
    isFeatured: therapist.isFeatured,
    isMostBooked: therapist.isFeatured || (therapist.rating >= 4.8 && therapist.reviewCount > 0),
  };
}

export async function getActiveTherapists(): Promise<MockTherapist[]> {
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
      },
      orderBy: [
        { isFeatured: 'desc' },
        { rating: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return dbTherapists.map((t) => formatDbTherapistToPublic(t));
  } catch (error) {
    console.error('Error in getActiveTherapists:', error);
    return [];
  }
}

export async function getActiveTherapistById(id: string): Promise<MockTherapist | null> {
  if (!id) return null;
  try {
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
      },
    });

    if (!therapist) return null;
    return formatDbTherapistToPublic(therapist);
  } catch (error) {
    console.error('Error in getActiveTherapistById:', error);
    return null;
  }
}
