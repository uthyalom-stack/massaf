import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function SafetyPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'safety' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Safety & Standards'}
      subtitle="Ensuring secure, professional, and therapeutic environments"
      content={content?.content || 'MASSAF prioritizes the safety and security of both clients and therapists. Learn about our safety protocols, secure address verification, and zero-tolerance policies for misconduct.'}
    />
  );
}
