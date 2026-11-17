import { Headphones, Radio } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
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
import type { Profile, VoiceConfig } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { useSettings } from "@/modules/settings/store";
import { SliderField } from "@/modules/studio/components/fields";
import { useTracking } from "@/modules/tracking";
import {
  CUSTOM_PRESET,
  VOICE_PRESETS,
  type VoiceFx,
  withFx,
  withPreset,
} from "@/modules/voice/presets";
import { useVoiceLinks } from "@/modules/voice/rtc";

const NONE = "__none";
const pct = (v: number) => `${Math.round(v * 100)} %`;

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
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <span className="text-xs leading-relaxed text-muted-foreground">
            {hint}
          </span>
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

export function VoiceEditor({ profile }: { profile: Profile }) {
  const update = useProfiles((s) => s.update);
  const settings = useSettings((s) => s.settings);
  const setSettings = useSettings((s) => s.set);
  const mic = useTracking((s) => s.mic);
  const level = useTracking((s) => s.level);
  const live = useVoiceLinks((s) => s.live);
  const overlay = useOverlayInfo();
  const v = profile.voice;
  const c = v.changer;

  const patch = (next: Partial<VoiceConfig>) =>
    update(profile.id, (p) => ({ ...p, voice: { ...p.voice, ...next } }));
  const setFx = (fx: Partial<VoiceFx>) => patch({ changer: withFx(c, fx) });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4" aria-labelledby="voice-anim">
        <h3 id="voice-anim" className="text-sm font-semibold">
          Animation par la voix
        </h3>
        <SwitchRow
          label="Seuil propre à ce persona"
          hint={`Sinon, le seuil global des réglages s'applique. Niveau actuel ${pct(level)}.`}
          checked={v.threshold !== null}
          onChange={(on) =>
            patch({ threshold: on ? settings.micThreshold : null })
          }
        />
        {v.threshold !== null ? (
          <SliderField
            label="Seuil de parole"
            value={v.threshold}
            min={0.02}
            max={0.95}
            onChange={(threshold) => patch({ threshold })}
          />
        ) : null}
        <SliderField
          label="Ouverture de la bouche selon le volume"
          value={v.mouthGain}
          min={0.3}
          max={2}
          onChange={(mouthGain) => patch({ mouthGain })}
        />
        <SliderField
          label="Volume d'un cri"
          value={v.shoutLevel}
          min={0.5}
          max={1}
          onChange={(shoutLevel) => patch({ shoutLevel })}
        />
        {profile.kind === "pngtuber" ? (
          <div className="flex items-center justify-between gap-4">
            <Label>Expression quand tu cries</Label>
            <Select
              value={v.shoutExpressionId ?? NONE}
              onValueChange={(id) =>
                patch({ shoutExpressionId: id === NONE ? null : String(id) })
              }
            >
              <SelectTrigger
                size="sm"
                className="w-40"
                aria-label="Expression quand tu cries"
              >
                <SelectValue>
                  {(id: string) =>
                    id === NONE
                      ? "Aucune"
                      : (profile.expressions.find((e) => e.id === id)?.name ??
                        "Aucune")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {profile.expressions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Quand tu cries, l'avatar lève les sourcils et ouvre grand la bouche.
          </p>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-4" aria-labelledby="voice-changer">
        <h3 id="voice-changer" className="text-sm font-semibold">
          Changeur de voix
        </h3>
        <SwitchRow
          label="Transformer ma voix"
          hint="La voix modifiée est envoyée à l'overlay OBS, avec l'avatar."
          checked={c.enabled}
          onChange={(enabled) => patch({ changer: { ...c, enabled } })}
        />
        {c.enabled ? (
          <>
            {mic !== "on" ? (
              <p role="alert" className="text-xs text-destructive">
                Active le micro pour entendre et envoyer la voix modifiée.
              </p>
            ) : null}
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Préréglages de voix</legend>
              {VOICE_PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={c.preset === p.id ? "default" : "secondary"}
                  aria-pressed={c.preset === p.id}
                  onClick={() => patch({ changer: withPreset(c, p.id) })}
                >
                  {p.label}
                </Button>
              ))}
              {c.preset === CUSTOM_PRESET ? (
                <Button size="sm" variant="default" aria-pressed>
                  Perso
                </Button>
              ) : null}
            </fieldset>
            <SliderField
              label="Hauteur"
              value={c.pitch}
              min={-12}
              max={12}
              step={0.5}
              format={(x) => `${x > 0 ? "+" : ""}${x} demi-tons`}
              onChange={(pitch) => setFx({ pitch })}
            />
            <SliderField
              label="Robot"
              value={c.robot}
              min={0}
              max={1}
              onChange={(robot) => setFx({ robot })}
            />
            <SliderField
              label="Radio"
              value={c.radio}
              min={0}
              max={1}
              onChange={(radio) => setFx({ radio })}
            />
            <SliderField
              label="Écho"
              value={c.echo}
              min={0}
              max={1}
              onChange={(echo) => setFx({ echo })}
            />
            <SliderField
              label="Réverbération"
              value={c.reverb}
              min={0}
              max={1}
              onChange={(reverb) => setFx({ reverb })}
            />
            <SliderField
              label="Volume"
              value={c.volume}
              min={0}
              max={2}
              onChange={(volume) => setFx({ volume })}
            />
            <SwitchRow
              label="M'écouter"
              hint="Avec un casque uniquement, sinon le micro reprend le son des enceintes."
              checked={settings.monitorVoice}
              onChange={(monitorVoice) => setSettings({ monitorVoice })}
            />
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {live > 0 ? (
                <Radio
                  className="mt-0.5 size-3.5 shrink-0 text-live"
                  aria-hidden
                />
              ) : (
                <Headphones className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              <span>
                {live > 0
                  ? `Voix envoyée à ${live} source${live > 1 ? "s" : ""} OBS. `
                  : overlay.clients > 0
                    ? "Connexion de la voix à OBS… "
                    : "Aucune source OBS connectée. "}
                Dans OBS, coche « Contrôler l'audio via OBS » sur la source
                Navigateur et coupe ta source micro habituelle pour ne pas
                entendre ta voix en double.
              </span>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
