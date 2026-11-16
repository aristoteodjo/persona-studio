import { Box, ImageIcon, Plus, ScanFace } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppModal } from "@/components/shared/app-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/modules/avatar";
import { mediaBase } from "@/modules/overlay-link";
import {
  coverImage,
  type Profile,
  type ProfileKind,
} from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";

type Props = {
  profiles: Profile[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export const KIND_LABEL: Record<ProfileKind, string> = {
  pngtuber: "2D",
  puppet: "2.5D",
  vrm: "3D",
};

const KINDS: {
  kind: ProfileKind;
  title: string;
  text: string;
  icon: typeof ImageIcon;
}[] = [
  {
    kind: "pngtuber",
    title: "2D · Plusieurs images",
    text: "Une image par état (repos, parle, cligne) et par expression. Rendu net, idéal pour un personnage dessiné.",
    icon: ImageIcon,
  },
  {
    kind: "puppet",
    title: "2.5D · Une seule image",
    text: "Un portrait de face. Le visage est détecté puis déformé en direct : tête, yeux, bouche, sourcils.",
    icon: ScanFace,
  },
  {
    kind: "vrm",
    title: "3D · Modèle VRM",
    text: "Un avatar 3D au format .vrm (VRoid Studio, Booth). Tête, buste, yeux, bouche et cheveux animés.",
    icon: Box,
  },
];

export function ProfileList({ profiles, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProfileKind>("pngtuber");
  const create = useProfiles((s) => s.create);
  const createMutation = useMutation({
    mutationFn: (input: { name: string; kind: ProfileKind }) =>
      create(input.name, input.kind),
    onSuccess: (p) => {
      if (!p || typeof p.id !== "string") return;
      onSelect(p.id);
      setOpen(false);
      setName("");
    },
    onError: (err) =>
      toast.error("Création impossible", { description: String(err) }),
  });
  const creating = createMutation.isPending;
  const base = mediaBase();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) createMutation.mutate({ name: trimmed, kind });
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border/70 bg-sidebar">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Personas
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus /> Nouveau
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-1 p-2">
          {profiles.map((p) => {
            const cover = coverImage(p);
            const active = p.id === activeId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                  )}
                >
                  <span className="checker relative size-11 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                    {cover && base ? (
                      <img
                        src={mediaUrl(base, p.id, cover)}
                        alt=""
                        className="size-full object-cover object-top"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.kind === "pngtuber"
                        ? `${p.expressions.length} expression${p.expressions.length > 1 ? "s" : ""}`
                        : p.kind === "puppet"
                          ? "Image animée"
                          : "Modèle 3D"}
                    </span>
                  </span>
                  <Badge variant={active ? "default" : "secondary"}>
                    {KIND_LABEL[p.kind]}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
        {profiles.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Aucun persona pour l'instant. Crée le premier à partir de tes
            images.
          </p>
        ) : null}
      </ScrollArea>

      <AppModal
        open={open}
        onOpenChange={setOpen}
        title="Nouveau persona"
        description="Choisis comment l'avatar sera animé. Tu ajouteras les images juste après."
        pending={creating}
        size="md"
        footer={
          <Button
            type="submit"
            form="new-profile"
            disabled={creating || !name.trim()}
          >
            {creating ? "Création…" : "Créer"}
          </Button>
        }
      >
        <form
          id="new-profile"
          onSubmit={submit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Nom</Label>
            <Input
              id="profile-name"
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Kira"
            />
          </div>
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-2 text-sm font-medium">Type d'avatar</legend>
            {KINDS.map((k) => (
              <label
                key={k.kind}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  kind === k.kind
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.kind}
                  checked={kind === k.kind}
                  onChange={() => setKind(k.kind)}
                  className="sr-only"
                />
                <k.icon className="size-5 text-primary" aria-hidden />
                <span className="text-sm font-medium">{k.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {k.text}
                </span>
              </label>
            ))}
          </fieldset>
        </form>
      </AppModal>
    </aside>
  );
}
