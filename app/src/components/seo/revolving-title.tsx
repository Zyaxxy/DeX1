'use client';

import { useRevolvingTitle } from '@/hooks/useRevolvingTitle';

export function RevolvingTitle({ titles }: { titles: string[] }) {
  useRevolvingTitle(titles);
  return null;
}
