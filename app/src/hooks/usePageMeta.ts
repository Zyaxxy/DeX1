'use client';

import { useEffect } from 'react';

interface PageMeta {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    if (meta.description) {
      setMeta('description', meta.description);
      setMeta('og:description', meta.ogDescription ?? meta.description);
    }
    if (meta.ogTitle) setMeta('og:title', meta.ogTitle);
    if (meta.ogImage) setMeta('og:image', meta.ogImage);
  }, [meta.description, meta.ogTitle, meta.ogImage, meta.ogDescription]);
}

function setMeta(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    if (property.startsWith('og:')) {
      el.setAttribute('property', property);
    } else {
      el.setAttribute('name', property);
    }
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
