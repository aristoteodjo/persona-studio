import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Link2, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { VrmConfig, VrmProfile } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { pickModel } from "@/modules/studio/lib/files";

type Props = {
  profile: VrmProfile;
  patch: (next: Partial<VrmConfig>) => void;
};

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Links the persona to a VRoid Studio export: every new export updates the avatar. */
export function VroidSync({ profile, patch }: Props) {
  const importImage = useProfiles((s) => s.importImage);
  const source = profile.vrm.source;

  const openVroid = useMutation({
    mutationFn: () => invoke<boolean>("vroid_open"),
    onSuccess: (opened) => {
      if (opened === true) return;
      toast.info("VRoid Studio n'est pas installé", {
        description:
          "Il est gratuit : la page de téléchargement s'ouvre dans ton navigateur.",
      });
      void invoke("vroid_download_page");
    },
  });

  const link = useMutation({
    mutationFn: async (path: string) => ({
      path,
      model: await importImage(profile.id, path),
    }),
    onSuccess: ({ path, model }) => {
      if (typeof model !== "string" || !model.endsWith(".vrm")) {
        toast.error("Ce fichier n'est pas un modèle VRM.");
        return;
      }
      patch({ source: path, model });
      toast.success("Export VRoid lié", {
        description:
          "Chaque nouvel export depuis VRoid Studio mettra l'avatar à jour.",
      });
    },
    onError: (e) =>
      toast.error("Liaison impossible", { description: String(e) }),
  });

  const pickExport = async () => {
    const path = await pickModel();
    if (path) link.mutate(path);
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3"
      aria-labelledby="vroid-sync"
    >
      <h3 id="vroid-sync" className="text-sm font-semibold">
        VRoid Studio
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Crée ou modifie ton avatar dans VRoid Studio, exporte-le en .vrm
        toujours au même endroit : Persona Studio le recharge tout seul, en
        gardant tes réglages.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openVroid.mutate()}
          disabled={openVroid.isPending}
        >
          <ExternalLink /> Ouvrir VRoid Studio
        </Button>
        {source ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ source: null })}
          >
            <Link2Off /> Délier
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={pickExport}
            disabled={link.isPending}
          >
            {link.isPending ? (
              <RefreshCw className="animate-spin" />
            ) : (
              <Link2 />
            )}
            Lier mon export .vrm
          </Button>
        )}
      </div>
      {source ? (
        <p className="flex items-center gap-1.5 text-xs text-live">
          <RefreshCw className="size-3" aria-hidden />
          Synchro active avec{" "}
          <span className="truncate font-mono">{fileName(source)}</span>
        </p>
      ) : null}
    </section>
  );
}
