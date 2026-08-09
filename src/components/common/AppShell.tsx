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
  personaName: string;
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
 *   >= 1100px   232px labelled rail
 *   768–1100    56px icon rail
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
        <ShellCommands />
        <div className="min-h-dvh md:flex">
          <MobileTopBar {...state} />
          <Sidebar {...state} />
          <main className="min-w-0 grow pb-16 md:pb-0">{children}</main>
          <BottomBar items={NAV_ITEMS} />
        </div>
        <CommandPalette />
        <ShortcutSheet />
      </ToastProvider>
    </CommandProvider>
  );
}

/** Navigation and the two always-available commands. Later slices add theirs. */
function ShellCommands() {
  const router = useRouter();
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
    ],
    [router],
  );
  return null;
}

function Sidebar(state: ShellState) {
  return (
    <div
      className={cn(
        "hidden shrink-0 flex-col border-r border-rule bg-surface md:flex",
        "md:w-(--sidebar-collapsed) wide:w-(--sidebar-width)",
      )}
    >
      <Link
        href="/today"
        className="flex items-center gap-2 border-b border-rule px-4 py-4 max-wide:justify-center max-wide:px-0"
      >
        <span aria-hidden className="type-body text-ink">
          ◆
        </span>
        <span className="type-body-strong truncate text-ink max-wide:hidden">{state.personaName}</span>
      </Link>

      <div className="grow py-3">
        <NavRail items={NAV_ITEMS} className="wide:hidden" collapsed />
        <NavRail items={NAV_ITEMS} className="max-wide:hidden" />
      </div>

      <div className="border-t border-rule py-3">
        <NavRail items={[SETTINGS_ITEM]} className="wide:hidden" collapsed />
        <NavRail items={[SETTINGS_ITEM]} className="max-wide:hidden" />
      </div>

      <div className="space-y-2 border-t border-rule px-4 py-3 max-wide:px-2">
        <p className="flex items-center gap-2 max-wide:justify-center">
          <span aria-hidden className="text-ink-3">
            ▪
          </span>
          <MicroLabel className="truncate max-wide:hidden">{state.model}</MicroLabel>
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
        <span aria-hidden className="text-ink">
          ◆
        </span>
        <span className="type-body-strong truncate text-ink">{state.personaName}</span>
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
 * real output. It is a mono label, not a badge — a badge would be colour, and
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
