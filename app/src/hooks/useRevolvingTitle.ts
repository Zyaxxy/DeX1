'use client';

import { useEffect } from 'react';

const DEFAULT_INTERVAL = 4000;

export function useRevolvingTitle(titles: string[], interval = DEFAULT_INTERVAL) {
  useEffect(() => {
    let index = 0;
    document.title = titles[0];
    const timer = setInterval(() => {
      index = (index + 1) % titles.length;
      document.title = titles[index];
    }, interval);
    return () => clearInterval(timer);
  }, [titles.join(',')]);
}
