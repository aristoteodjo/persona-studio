import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useEffect, useRef } from "react";
import type { Profile } from "@/modules/profiles/schema";
import { setExpression } from "@/modules/tracking";

const shortcut = (n: number) => `CommandOrControl+Shift+${n}`;

function expressionFor(profile: Profile | null, n: number): string | null {
  if (profile?.kind !== "pngtuber") return null;
  return profile.expressions.find((e) => e.hotkey === n)?.id ?? null;
}

/**
 * Expressions switch with Cmd/Ctrl+Shift+1..9 from anywhere (OBS focused, game
 * focused...) when global hotkeys are on, and with plain 1..9 inside the studio.
 */
export function useExpressionHotkeys(profile: Profile | null, global: boolean) {
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, [contenteditable=true], [role=dialog]",
        )
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const id = expressionFor(profileRef.current, n);
      if (id) setExpression(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!global) return;
    let cancelled = false;
    const keys = Array.from({ length: 9 }, (_, i) => shortcut(i + 1));
    register(keys, (event) => {
      if (event.state !== "Pressed") return;
      const n = Number(event.shortcut.slice(-1));
      const id = expressionFor(profileRef.current, n);
      if (id) setExpression(id);
    }).catch((e) => {
      if (!cancelled) console.warn("global shortcuts unavailable", e);
    });
    return () => {
      cancelled = true;
      unregisterAll().catch(() => {});
    };
  }, [global]);
}
