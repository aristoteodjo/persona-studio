import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Expression,
  type ExpressionSlot,
  newExpression,
  type PngtuberProfile,
} from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { ImageSlot, useImageImport } from "@/modules/studio/components/fields";

const SLOTS: { slot: ExpressionSlot; label: string; hint: string }[] = [
  { slot: "idle", label: "Repos", hint: "Bouche fermée, yeux ouverts" },
  { slot: "talk", label: "Parle", hint: "Bouche ouverte" },
  { slot: "blink", label: "Cligne", hint: "Yeux fermés" },
  { slot: "talkBlink", label: "Parle + cligne", hint: "Optionnel" },
];

const HOTKEYS = ["none", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export const slotDropId = (expressionId: string, slot: ExpressionSlot) =>
  `${expressionId}:${slot}`;

function SlotTile({
  profile,
  expression,
  slot,
  label,
  hint,
  dropHover,
}: {
  profile: PngtuberProfile;
  expression: Expression;
  slot: ExpressionSlot;
  label: string;
  hint: string;
  dropHover: string | null;
}) {
  const update = useProfiles((s) => s.update);
  const setSlot = (file: string | null) =>
    update(profile.id, (p) =>
      p.kind === "pngtuber"
        ? {
            ...p,
            expressions: p.expressions.map((e) =>
              e.id === expression.id ? { ...e, [slot]: file } : e,
            ),
          }
        : p,
    );
  const importer = useImageImport(profile.id, setSlot);
  const dropId = slotDropId(expression.id, slot);
  return (
    <ImageSlot
      profileId={profile.id}
      file={expression[slot]}
      label={label}
      hint={hint}
      dropId={dropId}
      dropHover={dropHover === dropId}
      onChange={setSlot}
      importer={importer}
    />
  );
}

type Props = {
  profile: PngtuberProfile;
  dropHover: string | null;
};

export function PngtuberEditor({ profile, dropHover }: Props) {
  const update = useProfiles((s) => s.update);

  const patchExpression = (id: string, patch: Partial<Expression>) =>
    update(profile.id, (p) =>
      p.kind === "pngtuber"
        ? {
            ...p,
            expressions: p.expressions.map((e) =>
              e.id === id ? { ...e, ...patch } : e,
            ),
          }
        : p,
    );

  const setHotkey = (id: string, value: string) => {
    const hotkey = value === "none" ? null : Number(value);
    update(profile.id, (p) =>
      p.kind === "pngtuber"
        ? {
            ...p,
            // A hotkey belongs to one expression only.
            expressions: p.expressions.map((e) =>
              e.id === id
                ? { ...e, hotkey }
                : e.hotkey === hotkey
                  ? { ...e, hotkey: null }
                  : e,
            ),
          }
        : p,
    );
  };

  const addExpression = () => {
    const used = new Set(profile.expressions.map((e) => e.hotkey));
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => !used.has(n)) ?? null;
    update(profile.id, (p) =>
      p.kind === "pngtuber"
        ? {
            ...p,
            expressions: [
              ...p.expressions,
              newExpression(`Expression ${p.expressions.length + 1}`, free),
            ],
          }
        : p,
    );
  };

  const removeExpression = (id: string) =>
    update(profile.id, (p) =>
      p.kind === "pngtuber" && p.expressions.length > 1
        ? { ...p, expressions: p.expressions.filter((e) => e.id !== id) }
        : p,
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Clique sur une case ou glisse une image dessus. Utilise des PNG détourés
        de même taille pour que les états se superposent parfaitement.
      </p>
      {profile.expressions.map((e) => (
        <div
          key={e.id}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3"
        >
          <div className="flex items-center gap-2">
            <Input
              aria-label="Nom de l'expression"
              value={e.name}
              maxLength={40}
              onChange={(ev) =>
                ev.target.value.trim() &&
                patchExpression(e.id, { name: ev.target.value })
              }
              className="h-8 flex-1"
            />
            <Select
              value={e.hotkey === null ? "none" : String(e.hotkey)}
              onValueChange={(v) => setHotkey(e.id, String(v))}
            >
              <SelectTrigger size="sm" className="w-24" aria-label="Raccourci">
                <SelectValue>
                  {(v: string) => (v === "none" ? "Aucun" : `Touche ${v}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HOTKEYS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h === "none" ? "Aucun" : `Touche ${h}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => removeExpression(e.id)}
              disabled={profile.expressions.length <= 1}
              aria-label={`Supprimer l'expression ${e.name}`}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {SLOTS.map((s) => (
              <SlotTile
                key={s.slot}
                profile={profile}
                expression={e}
                slot={s.slot}
                label={s.label}
                hint={s.hint}
                dropHover={dropHover}
              />
            ))}
          </div>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={addExpression}
        disabled={profile.expressions.length >= 9}
      >
        <Plus /> Ajouter une expression
      </Button>
    </div>
  );
}
