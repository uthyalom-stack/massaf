export interface TherapistService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  description: string;
}

export interface TherapistScheduleWindow {
  days: string;
  hours: string;
}

export interface PublicServiceArea {
  id: string;
  cityName: string;
  state: string;
  zipCode: string;
  endZipCode?: string | null;
}

export interface CustomerTherapist {
  id: string;
  name: string;
  title?: string;
  image: string;
  galleryImages: string[];
  rating: number;
  reviewCount: number;
  location: string;
  serviceAreas: string[];
  zipCodes: string[];
  rawServiceAreas?: PublicServiceArea[];
  startingPrice: number;
  availability: string;
  offersStudio: boolean;
  offersInHome: boolean;
  specialties: string[];
  bio: string;
  experience?: string;
  approach?: string;
  services: TherapistService[];
  schedule: TherapistScheduleWindow[];
  bookingCount: number;
  isFeatured: boolean;
  isHomepageSelected?: boolean;
}

export interface MockTherapist {
  id: string;
  name: string;
  title: string;
  image: string;
  galleryImages: string[];
  rating: number;
  reviewCount: number;
  location: string;
  serviceAreas: string[];
  zipCodes: string[];
  startingPrice: number;
  availability: string;
  offersStudio: boolean;
  offersInHome: boolean;
  specialties: string[];
  bio: string;
  experience: string;
  approach: string;
  services: TherapistService[];
  schedule: TherapistScheduleWindow[];
  isMostBooked?: boolean;
  isFeatured?: boolean;
}

export interface MockReview {
  id: string;
  therapistId?: string;
  therapistName?: string;
  customerName: string;
  customerLocation: string;
  rating: number;
  date: string;
  comment: string;
  serviceType: string;
}

export interface MockTestimonial {
  id: string;
  customerName: string;
  customerLocation: string;
  rating: number;
  title: string;
  comment: string;
  verifiedBooking: boolean;
  date: string;
}

export interface NavItem {
  label: string;
  href: string;
}
