'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function DashboardRouteRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const visitedRoutes = useRef(new Set<string>());

  useEffect(() => {
    if (!visitedRoutes.current.has(pathname)) {
      visitedRoutes.current.add(pathname);
      return;
    }

    // Let the cached route paint first, then replace it with fresh cloud data.
    const frame = requestAnimationFrame(() => router.refresh());
    return () => cancelAnimationFrame(frame);
  }, [pathname, router]);

  return null;
}