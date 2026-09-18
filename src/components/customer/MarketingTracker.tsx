'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackMarketingClickAction } from '@/app/actions/marketing';

export function MarketingTracker() {
  const searchParams = useSearchParams();
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    const ref = searchParams?.get('ref');
    if (ref && ref !== trackedRef.current) {
      trackedRef.current = ref;
      // Trigger tracking action once
      trackMarketingClickAction(ref).catch(() => {
        // Silent catch: marketing click errors should never disrupt customer experience
      });
    }
  }, [searchParams]);

  return null;
}
