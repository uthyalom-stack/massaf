export interface MockTherapist {
  id: string;
  name: string;
  title: string;
  image: string;
  rating: number;
  reviewCount: number;
  location: string; // e.g. "Los Angeles, CA"
  serviceAreas: string[]; // e.g. ["Downtown LA", "Beverly Hills", "Santa Monica"]
  zipCodes: string[]; // e.g. ["90210", "90401", "90230"]
  startingPrice: number;
  availability: string; // e.g. "Available Today", "Next available Tomorrow"
  offersStudio: boolean;
  offersInHome: boolean;
  specialties: string[];
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
