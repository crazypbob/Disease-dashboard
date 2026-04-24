'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; label: string };

const tabs: Tab[] = [
  { href: '/dashboard/admin/access', label: '가입 승인' },
  { href: '/dashboard/admin/drive-approvals', label: 'Drive 승인' },
  { href: '/dashboard/admin/debug-reports', label: '디버그리포트' },
  { href: '/dashboard?aud=dabi&view=matrix', label: '대시보드' },
];

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith('/dashboard/admin')) return pathname === href;
  return pathname.startsWith('/dashboard');
}

export function AdminTabs() {
  const pathname = usePathname() || '';
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              active
                ? 'rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white'
                : 'rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50'
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

