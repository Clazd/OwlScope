"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format/cn";
import { Glyph, type GlyphName } from "./Glyph";

export interface NavItem {
  href: string;
  label: string;
  glyph: GlyphName;
  /** The letter in the `G` chord. */
  key: string;
}

/** The five areas plus Settings. Six items, and there will never be a seventh. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", glyph: "today", key: "t" },
  { href: "/brain", label: "Brain", glyph: "brain", key: "b" },
  { href: "/radar", label: "Radar", glyph: "radar", key: "r" },
  { href: "/studio", label: "Studio", glyph: "studio", key: "s" },
  { href: "/memory", label: "Memory", glyph: "memory", key: "m" },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  glyph: "settings",
  key: ",",
};

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavRailProps {
  items: NavItem[];
  /** 72px icon rail instead of the 280px labelled one. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Pill-based active state: the active item gets a subtle accent-tinted
 * background and an accent-coloured icon. Hover shows a surface-sunken pill.
 */
export function NavRail({ items, collapsed = false, className }: NavRailProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-0.5 px-2", className)} aria-label="Areas">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-control px-3 py-2",
              "transition-colors duration-(--dur-state) ease-(--ease)",
              collapsed ? "justify-center" : "",
              active
                ? "bg-accent-dim type-body-strong text-ink"
                : "type-body text-ink-3 hover:bg-surface-sunken hover:text-ink-2",
            )}
          >
            <Glyph
              name={item.glyph}
              className={cn(
                "shrink-0 transition-colors duration-(--dur-state)",
                active ? "text-accent" : "group-hover:text-ink-2",
              )}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {collapsed && <span className="sr-only">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Below 768px the rail becomes a bottom bar. Nothing hides behind a hamburger. */
export function BottomBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Areas"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-rule bg-surface md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2",
              active ? "text-accent" : "text-ink-3",
            )}
          >
            <Glyph name={item.glyph} />
            <span className={cn("type-micro", active ? "text-accent" : "")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
