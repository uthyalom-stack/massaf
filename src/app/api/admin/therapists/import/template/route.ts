import { NextResponse } from 'next/server';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export async function GET() {
  const session = await getVerifiedAdminSession();
  if (!session || session.role === 'STAFF') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const headers = [
    'Full Name',
    'Bio',
    'Profile Photo',
    'Email',
    'Phone',
    'Telegram Chat ID',
    'Hourly Rate',
    'Offers Studio',
    'Offers In-Home',
    'Services',
    'Availability',
    'Gallery Photos',
  ];

  const sampleRows = [
    [
      'Jane Doe',
      'Licensed massage therapist with 8 years of clinical experience specializing in deep tissue and sports recovery.',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      'jane.doe@example.com',
      '+1 (555) 234-5678',
      '123456789',
      '110.00',
      'Yes',
      'Yes',
      'Swedish Massage, Deep Tissue Massage',
      'Mon-Fri 09:00-17:00',
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef, https://images.unsplash.com/photo-1519823551278-64ac92734fb1',
    ],
    [
      'John Smith',
      'Certified massage specialist focusing on studio sports therapy and relaxation.',
      'https://images.unsplash.com/photo-1560250097-0b93528c311a',
      'john.smith@example.com',
      '+1 (555) 876-5432',
      '',
      '120.00',
      'Yes',
      'No',
      'Sports Massage',
      'Tue-Sat 10:00-18:00',
      '',
    ],
  ];

  function escapeCsv(val: string) {
    return `"${val.replace(/"/g, '""')}"`;
  }

  const csvContent =
    headers.map(escapeCsv).join(',') +
    '\r\n' +
    sampleRows.map((r) => r.map(escapeCsv).join(',')).join('\r\n');

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="massaf_therapist_import_template.csv"',
    },
  });
}
