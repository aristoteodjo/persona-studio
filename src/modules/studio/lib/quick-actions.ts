import { type Profile, VRM_REST_EXPRESSIONS } from "@/modules/profiles/schema";

export type QuickAction = {
  id: string;
  label: string;
  hotkey: number | null;
  hint: string;
};

export const MOOD_LABEL: Record<(typeof VRM_REST_EXPRESSIONS)[number], string> =
  {
    neutral: "Neutre",
    happy: "Joyeux",
    relaxed: "Détendu",
    angry: "Fâché",
    sad: "Triste",
    surprised: "Surpris",
  };

/**
 * Live actions shown under the preview: 2D expressions keep their own hotkeys,
 * 3D moods take 1..6 in order. Both switch through the same live expression id.
 */
export function quickActions(profile: Profile | null): QuickAction[] {
  if (profile?.kind === "pngtuber") {
    return profile.expressions.map((e) => ({
      id: e.id,
      label: e.name,
      hotkey: e.hotkey,
      hint: `Afficher l'expression « ${e.name} »`,
    }));
  }
  if (profile?.kind === "vrm") {
    return VRM_REST_EXPRESSIONS.map((m, i) => ({
      id: m,
      label: MOOD_LABEL[m],
      hotkey: i + 1,
      hint:
        m === "neutral"
          ? "Revenir à l'humeur au repos du persona"
          : `Passer en humeur « ${MOOD_LABEL[m]} » à pleine intensité`,
    }));
  }
  return [];
}

/** Which action is live; 3D falls back to "neutral", 2D to its first expression. */
export function activeAction(
  actions: QuickAction[],
  liveId: string | null,
): string | null {
  return actions.find((a) => a.id === liveId)?.id ?? actions[0]?.id ?? null;
}

export function actionForHotkey(
  profile: Profile | null,
  n: number,
): string | null {
  return quickActions(profile).find((a) => a.hotkey === n)?.id ?? null;
}
