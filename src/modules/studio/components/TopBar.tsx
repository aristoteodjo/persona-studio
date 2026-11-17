import { Check, Copy, Info, Radio, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useOverlayInfo } from "@/modules/overlay-link";

export type Section = "studio" | "atelier";

type Props = {
  section: Section;
  onSection: (s: Section) => void;
  onSettings: () => void;
  onAbout: () => void;
};

const SECTIONS: { id: Section; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "atelier", label: "Atelier" },
];

export function TopBar({ section, onSection, onSettings, onAbout }: Props) {
  const overlay = useOverlayInfo();
  const [copied, setCopied] = useState(false);
  const live = overlay.clients > 0;

  const copy = async () => {
    if (!overlay.url) return;
    try {
      await navigator.clipboard.writeText(overlay.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      console.error("clipboard failed", e);
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 pr-3 pl-22"
    >
      <h1
        data-tauri-drag-region
        className="font-heading text-sm font-semibold tracking-tight"
      >
        Persona Studio
      </h1>
      <nav
        aria-label="Sections"
        className="ml-3 flex gap-0.5 rounded-lg border border-border bg-card/60 p-0.5"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === section ? "page" : undefined}
            onClick={() => onSection(s.id)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              s.id === section
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div data-tauri-drag-region className="flex-1" />

      <div className="flex items-center gap-1 rounded-lg border border-border bg-card/60 py-1 pr-1 pl-2.5">
        <Radio
          aria-hidden
          className={cn(
            "size-3.5",
            live ? "text-live" : "text-muted-foreground",
          )}
        />
        <span className="text-xs text-muted-foreground">
          {live
            ? `OBS connecté (${overlay.clients})`
            : overlay.url
              ? "OBS en attente"
              : "Overlay indisponible"}
        </span>
        <code className="mx-1 hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/90 lg:inline">
          {overlay.url || "…"}
        </code>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={copy}
                disabled={!overlay.url}
                aria-label="Copier l'URL pour OBS"
              />
            }
          >
            {copied ? <Check className="text-live" /> : <Copy />}
          </TooltipTrigger>
          <TooltipContent>
            Copier l'URL, puis l'ajouter dans OBS comme source « Navigateur »
          </TooltipContent>
        </Tooltip>
      </div>

      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onSettings}
        aria-label="Réglages"
      >
        <Settings2 />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onAbout}
        aria-label="À propos"
      >
        <Info />
      </Button>
    </header>
  );
}
