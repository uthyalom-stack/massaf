import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function TherapistVerificationPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'therapist-verification' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Therapist Verification Standard'}
      subtitle="Our rigorous vetting and credential verification process"
      content={content?.content || 'Every massage therapist on the MASSAF network undergoes mandatory background checks, state license verification, professional liability insurance checks, and identity validation before joining our platform.'}
    />
  );
}
