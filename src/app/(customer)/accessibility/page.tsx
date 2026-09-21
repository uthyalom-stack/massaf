import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function AccessibilityPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'accessibility' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Accessibility Statement'}
      subtitle="Our commitment to digital accessibility for all users"
      content={content?.content || 'MASSAF is dedicated to ensuring digital accessibility for people with disabilities. We continuously improve the user experience for everyone and apply the relevant accessibility standards.'}
    />
  );
}
