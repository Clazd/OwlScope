"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { CommandPalette } from "./CommandPalette";
import { CommandProvider, useRegisterCommands } from "./command-registry";
import { MicroLabel } from "./MicroLabel";
import { NAV_ITEMS, NavRail, BottomBar, SETTINGS_ITEM } from "./NavRail";
import { ShortcutSheet } from "./ShortcutSheet";
import { TokenMeter } from "./TokenMeter";
import { ToastProvider } from "./Toast";

export interface ShellState {
  brandName: string;
  /** The model that expensive work will use, shown in mono. */
  model: string;
  tokensUsed: number;
  tokensBudget: number;
  sandbox: boolean;
}

interface AppShellProps extends ShellState {
  children: ReactNode;
}

/**
 * Sidebar plus content region.
 *
 *   >= 1100px   280px labelled rail
 *   768-1100    72px icon rail
 *   < 768px     top bar plus a five-item bottom bar
 *
 * Both rails are rendered and swapped in CSS rather than measured in JS, so
 * there is no layout flash and nothing to get wrong during hydration.
 */
export function AppShell({ children, ...state }: AppShellProps) {
  const router = useRouter();

  const goTargets = useMemo(() => {
    const targets: Record<string, () => void> = {};
    for (const item of NAV_ITEMS) targets[item.key] = () => router.push(item.href);
    return targets;
  }, [router]);

  return (
    <CommandProvider goTargets={goTargets}>
      <ToastProvider>
        <ShellCommands sandbox={state.sandbox} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-bg focus:type-body-strong focus:shadow-pop"
        >
          Skip to content
        </a>
        <div className="min-h-dvh overflow-x-clip md:flex">
          <MobileTopBar {...state} />
          <Sidebar {...state} />
          <main id="main-content" className="min-w-0 grow pb-16 md:pb-0">{children}</main>
          <BottomBar items={NAV_ITEMS} />
        </div>
        <CommandPalette />
        <ShortcutSheet />
      </ToastProvider>
    </CommandProvider>
  );
}

/** Navigation and the two always-available commands. Later slices add theirs. */
function ShellCommands({ sandbox }: { sandbox: boolean }) {
  const router = useRouter();
  const updateSetting = async () => {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (!response.ok) return;
    const settings = await response.json();
    const next = { ...settings, sandbox: { enabled: !sandbox } };
    const saved = await fetch("/api/settings", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    });
    if (saved.ok) router.refresh();
  };
  useRegisterCommands(
    [
      ...NAV_ITEMS.map((item) => ({
        id: `go:${item.href}`,
        label: `Go to ${item.label}`,
        group: "Navigate",
        shortcut: `G ${item.key.toUpperCase()}`,
        run: () => router.push(item.href),
      })),
      {
        id: "go:/settings",
        label: "Go to Settings",
        group: "Navigate",
        run: () => router.push("/settings"),
      },
      {
        id: "go:/inspect",
        label: "Open run inspector",
        group: "Debug",
        keywords: "runs prompts tokens cost inspect",
        run: () => router.push("/inspect"),
      },
      {
        id: "go:/inspect/components",
        label: "Open component gallery",
        group: "Debug",
        keywords: "design system states gallery",
        run: () => router.push("/inspect/components"),
      },
      {
        id: "settings:sandbox",
        label: "Toggle sandbox",
        group: "Settings",
        keywords: "fixtures network cost",
        run: () => void updateSetting(),
      },
    ],
    [router, sandbox],
  );
  return null;
}

function Sidebar(state: ShellState) {
  return (
    <div
      className={cn(
        "hidden shrink-0 flex-col border-r border-rule md:flex",
        "md:w-(--sidebar-collapsed) wide:w-(--sidebar-width)",
      )}
      style={{ background: "#0C0F14" }}
    >
      {/* Brand header — logo bg bleeds into sidebar so they read as one surface */}
      <Link
        href="/today"
        className={cn(
          "flex min-w-0 items-center gap-3 border-b border-rule px-3 py-3",
          "max-wide:justify-center max-wide:px-0 max-wide:py-3",
          "transition-opacity duration-(--dur-state) hover:opacity-80",
        )}
        style={{ background: "#0C0F14" }}
      >
        <OwlMark />
        <span
          className="type-body-strong truncate max-wide:hidden"
          style={{ color: "#F4F6FA", letterSpacing: "0.01em" }}
        >
          {state.brandName}
        </span>
      </Link>

      {/* Thin accent rule below the logo — scope line */}
      <div
        className="h-px shrink-0"
        style={{ background: "linear-gradient(90deg, var(--accent) 0%, transparent 60%)" }}
      />

      <div className="grow py-3">
        <NavRail items={NAV_ITEMS} className="wide:hidden" collapsed />
        <NavRail items={NAV_ITEMS} className="max-wide:hidden" />
      </div>

      <div className="border-t border-rule py-3">
        <NavRail items={[SETTINGS_ITEM]} className="wide:hidden" collapsed />
        <NavRail items={[SETTINGS_ITEM]} className="max-wide:hidden" />
      </div>

      <div
        className="overflow-hidden border-t border-rule px-4 py-3 max-wide:px-2"
        style={{ background: "rgba(0,0,0,0.25)" }}
      >
        <p className="flex min-w-0 items-center gap-2 mb-2 max-wide:justify-center">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-pill stage-pulse"
            style={{ background: "var(--accent)", opacity: 0.8 }}
          />
          <MicroLabel className="min-w-0 truncate max-wide:hidden">{state.model}</MicroLabel>
        </p>
        <TokenMeter used={state.tokensUsed} budget={state.tokensBudget} compact />
        {state.sandbox && <SandboxLabel />}
      </div>
    </div>
  );
}

function MobileTopBar(state: ShellState) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-rule bg-surface px-4 py-3 md:hidden">
      <Link href="/today" className="flex min-w-0 items-center gap-2">
        <OwlMark />
        <span className="type-body-strong truncate text-ink">{state.brandName}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-3">
        {state.sandbox && <SandboxLabel />}
        <Link href="/settings" className="type-small text-ink-2 hover:text-ink">
          Settings
        </Link>
      </div>
    </header>
  );
}

/**
 * Sandbox state is always visible, so fixture output can never be mistaken for
 * real output. It is a mono label, not a badge - a badge would be colour, and
 * colour is reserved.
 */
function SandboxLabel() {
  return (
    <span
      data-mono
      title="Every model call is being served from /fixtures. No network, no cost."
      className="type-micro inline-block rounded-control border border-rule-strong px-2 py-1 text-ink-2"
    >
      Sandbox
    </span>
  );
}

/**
 * Square logo mark, zoomed into the owl face.
 * The dark background of the PNG matches the sidebar (#0C0F14) so the
 * logo bleeds seamlessly into the panel — no border, no gap.
 */
function OwlMark() {
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{ width: 44, height: 44, borderRadius: 6, background: "#0C0F14" }}
    >
      <img
        src="/owlscope-logo.png"
        alt=""
        aria-hidden
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 18%",
          transform: "scale(1.35)",
          transformOrigin: "center 30%",
        }}
      />
    </div>
  );
}
