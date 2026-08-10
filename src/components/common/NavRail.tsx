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
  /** 56px icon rail instead of the 232px labelled one. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Active state is a 2px left ink bar and a weight change from 400 to 500.
 * No filled pill, no background, no colour - the nav is chrome, and chrome does
 * not get to use the epistemic palette.
 */
export function NavRail({ items, collapsed = false, className }: NavRailProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col", className)} aria-label="Areas">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "relative flex items-center gap-3 py-2 pr-3",
              collapsed ? "justify-center pl-0" : "pl-4",
              "transition-colors duration-(--dur-state) ease-(--ease)",
              active ? "type-body-strong text-ink" : "type-body text-ink-2 hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn("absolute left-0 top-1 bottom-1 w-px", active ? "bg-accent" : "bg-transparent")}
              style={active ? { width: "2px" } : undefined}
            />
            <Glyph name={item.glyph} className={active ? "text-ink" : "text-ink-3"} />
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
              active ? "text-ink" : "text-ink-3",
            )}
          >
            <Glyph name={item.glyph} />
            <span className={cn("type-micro", active && "text-ink")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
