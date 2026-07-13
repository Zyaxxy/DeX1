'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const adminLinks = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Launch Token', href: '/admin/launch' },
  { name: 'Markets', href: '/admin/markets' },
  { name: 'Create Contest', href: '/admin/create-contest' },
  { name: 'Contests', href: '/admin/contests' },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 flex-wrap">
      {adminLinks.map(link => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {link.name}
          </Link>
        );
      })}
    </nav>
  );
}
