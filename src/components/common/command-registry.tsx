"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface Command {
  id: string;
  label: string;
  /** Section heading in the palette. */
  group: string;
  /** Extra words that should match this command when searched. */
  keywords?: string;
  /** Display-only hint, e.g. "G T". */
  shortcut?: string;
  run: () => void;
}

interface CommandApi {
  commands: Command[];
  /** Returns an unregister function. Later slices call this on mount. */
  register: (commands: Command[]) => () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

const CommandContext = createContext<CommandApi | null>(null);

export function useCommands(): CommandApi {
  const api = useContext(CommandContext);
  if (!api) throw new Error("useCommands must be used inside <CommandProvider>");
  return api;
}

/**
 * Registers commands for as long as the calling component is mounted. This is
 * the extension point: a later slice adds "Generate post" or "Rescan radar"
 * from inside its own page and the palette picks it up with no edits here.
 */
export function useRegisterCommands(commands: Command[], deps: unknown[] = []) {
  const { register } = useCommands();
  useEffect(() => {
    return register(commands);
    // The caller controls identity through deps; commands are rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** True when a keystroke should be left alone because the user is typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

interface CommandProviderProps {
  children: ReactNode;
  /** `G` then this letter navigates. Provided by the shell. */
  goTargets: Record<string, () => void>;
}

export function CommandProvider({ children, goTargets }: CommandProviderProps) {
  const [registry, setRegistry] = useState<Command[][]>([]);
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const awaitingGo = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback((commands: Command[]) => {
    const entry = commands;
    setRegistry((current) => [...current, entry]);
    return () => setRegistry((current) => current.filter((group) => group !== entry));
  }, []);

  // The keydown listener is registered once and reads the current targets
  // lazily, so the ref is updated after commit rather than during render.
  const goTargetsRef = useRef(goTargets);
  useEffect(() => {
    goTargetsRef.current = goTargets;
  }, [goTargets]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Cmd/Ctrl K works everywhere, including inside a text field.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape") {
        setOpen(false);
        setShortcutsOpen(false);
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
        return;
      }

      // `G` then a letter. The chord expires after a second so a stray G does
      // not swallow the next keystroke you meant for something else.
      if (awaitingGo.current) {
        const target = goTargetsRef.current[event.key.toLowerCase()];
        awaitingGo.current = false;
        if (goTimer.current) clearTimeout(goTimer.current);
        if (target) {
          event.preventDefault();
          target();
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingGo.current = true;
        if (goTimer.current) clearTimeout(goTimer.current);
        goTimer.current = setTimeout(() => {
          awaitingGo.current = false;
        }, 1000);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (goTimer.current) clearTimeout(goTimer.current);
    };
  }, []);

  const commands = useMemo(() => registry.flat(), [registry]);

  const api = useMemo<CommandApi>(
    () => ({ commands, register, open, setOpen, shortcutsOpen, setShortcutsOpen }),
    [commands, register, open, shortcutsOpen],
  );

  return <CommandContext.Provider value={api}>{children}</CommandContext.Provider>;
}
