'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  breakpoint?: 'md' | 'lg';
  expandedWidth?: string;
  collapsedWidth?: string;
  header?: React.ReactNode;
}

export function Sidebar({
  collapsed,
  onToggle,
  children,
  breakpoint = 'md',
  expandedWidth = 'w-60',
  collapsedWidth = 'w-16',
  header,
}: SidebarProps) {
  const hideClass = breakpoint === 'lg' ? 'hidden lg:flex' : 'hidden md:flex';

  return (
    <aside className={`${hideClass} flex-col bg-surface-container-lowest border-r border-border shrink-0 h-full transition-all duration-300 ${collapsed ? collapsedWidth : expandedWidth}`}>
      <div className={`flex items-center ${collapsed ? 'flex-col p-3 gap-3' : 'px-6 pt-6 justify-between'}`}>
        {!collapsed && <div className="min-w-0">{header}</div>}
        <button
          onClick={onToggle}
          className="p-1.5 text-[#c6c9ab] hover:text-white transition-colors"
        >
          <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {children}
    </aside>
  );
}

interface SidebarNavItemProps {
  href: string;
  icon: LucideIcon;
  active?: boolean;
  collapsed: boolean;
  children: React.ReactNode;
}

export function SidebarNavItem({ href, icon: Icon, active, collapsed, children }: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-2 font-mono text-[13px] tracking-[0.02em] transition-all duration-200 ${
        active
          ? 'bg-surface-container-highest border-r-2 border-primary text-white'
          : 'text-[#c6c9ab] hover:bg-surface-container-low hover:text-white'
      } ${collapsed ? 'justify-center px-2 border-r-0' : ''}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span>{children}</span>}
    </Link>
  );
}
