import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function PrivacyPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'privacy' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Privacy Policy'}
      subtitle="How MASSAF protects and handles your personal data"
      content={content?.content || 'MASSAF is committed to protecting your personal information and privacy. This Privacy Policy details how we collect, use, and safeguard your data.'}
    />
  );
}
