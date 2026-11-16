import { useId } from "react";
import { AppModal } from "@/components/shared/app-modal";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useOverlayInfo } from "@/modules/overlay-link";
import { type MouthSource, useSettings } from "@/modules/settings/store";
import { SliderField } from "@/modules/studio/components/fields";
import { type Device, useMediaDevices, useTracking } from "@/modules/tracking";

const DEFAULT = "__default";

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: Device[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const items = [{ id: DEFAULT, label: "Par défaut du système" }, ...devices];
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Select
        value={value ?? DEFAULT}
        onValueChange={(v) => onChange(v === DEFAULT ? null : String(v))}
      >
        <SelectTrigger className="w-64" aria-label={label}>
          <SelectValue>
            {(v: string) =>
              items.find((d) => d.id === v)?.label ?? "Périphérique absent"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
      />
    </div>
  );
}

const MOUTH: { value: MouthSource; label: string }[] = [
  { value: "both", label: "Voix et visage" },
  { value: "voice", label: "Voix uniquement" },
  { value: "face", label: "Visage uniquement" },
];

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function SettingsModal({ open, onOpenChange }: Props) {
  const { settings, set } = useSettings();
  const { cameras, mics } = useMediaDevices();
  const level = useTracking((s) => s.level);
  const overlay = useOverlayInfo();

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Réglages"
      size="lg"
    >
      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-1">
        <section className="flex flex-col gap-4" aria-labelledby="s-cam">
          <h3 id="s-cam" className="text-sm font-semibold">
            Caméra
          </h3>
          <SwitchRow
            label="Suivi du visage"
            checked={settings.cameraEnabled}
            onChange={(cameraEnabled) => set({ cameraEnabled })}
          />
          <DeviceSelect
            label="Caméra"
            devices={cameras}
            value={settings.cameraId}
            onChange={(cameraId) => set({ cameraId })}
          />
          <SwitchRow
            label="Effet miroir"
            hint="L'avatar bouge comme ton reflet : tu penches à droite, il penche à droite à l'écran."
            checked={settings.mirror}
            onChange={(mirror) => set({ mirror })}
          />
          <SliderField
            label="Lissage des mouvements"
            value={settings.smoothing}
            min={0}
            max={1}
            onChange={(smoothing) => set({ smoothing })}
          />
        </section>
        <Separator />
        <section className="flex flex-col gap-4" aria-labelledby="s-mic">
          <h3 id="s-mic" className="text-sm font-semibold">
            Micro
          </h3>
          <SwitchRow
            label="Animation par la voix"
            checked={settings.micEnabled}
            onChange={(micEnabled) => set({ micEnabled })}
          />
          <DeviceSelect
            label="Micro"
            devices={mics}
            value={settings.micId}
            onChange={(micId) => set({ micId })}
          />
          <SliderField
            label={`Seuil de parole (niveau actuel ${Math.round(level * 100)} %)`}
            value={settings.micThreshold}
            min={0.02}
            max={0.95}
            onChange={(micThreshold) => set({ micThreshold })}
          />
          <div className="flex items-center justify-between gap-4">
            <Label>La bouche s'ouvre avec</Label>
            <Select
              value={settings.mouthSource}
              onValueChange={(v) => set({ mouthSource: v as MouthSource })}
            >
              <SelectTrigger className="w-64" aria-label="Source de la bouche">
                <SelectValue>
                  {(v: string) => MOUTH.find((m) => m.value === v)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MOUTH.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>
        <Separator />
        <section className="flex flex-col gap-4" aria-labelledby="s-keys">
          <h3 id="s-keys" className="text-sm font-semibold">
            Raccourcis
          </h3>
          <SwitchRow
            label="Raccourcis globaux"
            hint="Cmd + Maj + 1 à 9 change d'expression même quand OBS ou un jeu est au premier plan."
            checked={settings.globalHotkeys}
            onChange={(globalHotkeys) => set({ globalHotkeys })}
          />
        </section>
        <Separator />
        <section
          className="flex flex-col gap-2 text-sm"
          aria-labelledby="s-obs"
        >
          <h3 id="s-obs" className="font-semibold">
            Ajouter l'avatar dans OBS
          </h3>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Dans OBS, ajoute une source « Navigateur ».</li>
            <li>
              URL :{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground select-text">
                {overlay.url || "serveur en cours de démarrage"}
              </code>
            </li>
            <li>Largeur 1920, hauteur 1080. Le fond est déjà transparent.</li>
            <li>
              Laisse Persona Studio ouvert pendant le live : c'est lui qui suit
              ton visage.
            </li>
          </ol>
        </section>
      </div>
    </AppModal>
  );
}
