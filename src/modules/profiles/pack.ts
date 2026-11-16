import type { ExpressionSlot } from "@/modules/profiles/schema";

export type PackFolder = { name: string; files: string[] };
export type PackExpression = {
  name: string;
  slots: Partial<Record<ExpressionSlot, string>>;
};

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/**
 * Reads the state out of a file name ("EyesClosedMouthOpen", "talk_blink",
 * "eyes open mouth closed"...). Names without any state word are not part of
 * the rig (cover art, thumbnails) and return null.
 */
export function classifyImage(path: string): ExpressionSlot | null {
  const n = basename(path)
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const eyesClosed = /eyes?clos|closedeyes?|blink|eyesshut/.test(n);
  const eyesOpen = /eyes?open|openeyes?/.test(n);
  const mouthOpen = /mouthopen|openmouth|talk|speak|open(?!eye)/.test(
    n.replace(/eyes?open/g, ""),
  );
  const mouthClosed = /mouthclos|closedmouth|idle|neutral|silent/.test(n);
  if (!eyesClosed && !eyesOpen && !mouthOpen && !mouthClosed) return null;
  if (eyesClosed) return mouthOpen ? "talkBlink" : "blink";
  return mouthOpen ? "talk" : "idle";
}

/** Folders with at least a resting image become expressions. */
export function packExpressions(
  folders: readonly PackFolder[],
): PackExpression[] {
  const out: PackExpression[] = [];
  for (const f of folders) {
    const slots: PackExpression["slots"] = {};
    for (const file of f.files) {
      const slot = classifyImage(file);
      if (slot && !slots[slot]) slots[slot] = file;
    }
    if (slots.idle) out.push({ name: f.name.slice(0, 40), slots });
  }
  return out.slice(0, 9);
}
