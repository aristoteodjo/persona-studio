import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { AppModal } from "@/components/shared/app-modal";

const LICENSES = [
  ["MediaPipe Face Landmarker", "Apache-2.0"],
  ["Tauri", "MIT / Apache-2.0"],
  ["React", "MIT"],
  ["Base UI, shadcn/ui", "MIT"],
  ["Delaunator", "ISC"],
  ["Lucide", "ISC"],
  ["Inter, Space Grotesk", "OFL-1.1"],
] as const;

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function AboutModal({ open, onOpenChange }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [open]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Persona Studio"
      description={version ? `Version ${version}` : undefined}
      size="sm"
    >
      <p className="text-sm text-muted-foreground">
        Anime n'importe quel persona à partir de tes images et diffuse-le dans
        OBS. Tout tourne en local : ni ta caméra ni tes images ne quittent cet
        ordinateur.
      </p>
      <div className="text-sm">
        <h3 className="mb-2 font-semibold">Licences</h3>
        <ul className="space-y-1 text-muted-foreground">
          {LICENSES.map(([name, license]) => (
            <li key={name} className="flex justify-between gap-4">
              <span>{name}</span>
              <span className="font-mono text-xs">{license}</span>
            </li>
          ))}
        </ul>
      </div>
    </AppModal>
  );
}
