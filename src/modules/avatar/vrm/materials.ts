/** Turns raw material names (VRoid exports look like "N00_000_00_HairBack_00_HAIR (Instance)") into editable parts. */

export type PartGroup =
  | "hair"
  | "face"
  | "eyes"
  | "skin"
  | "clothes"
  | "accessory"
  | "other";

export const GROUP_LABEL: Record<PartGroup, string> = {
  hair: "Cheveux",
  face: "Visage",
  eyes: "Yeux",
  skin: "Peau",
  clothes: "Vêtements",
  accessory: "Accessoires",
  other: "Autres",
};

export const GROUP_ORDER: PartGroup[] = [
  "hair",
  "eyes",
  "face",
  "skin",
  "clothes",
  "accessory",
  "other",
];

/** Outline passes are separate materials in three-vrm; they share their base material's settings. */
export const materialKey = (name: string) =>
  name
    .replace(/\s*\(Outline\)\s*$/i, "")
    .replace(/\s*\(Instance\)\s*/gi, "")
    .trim();

export function partGroup(key: string): PartGroup {
  const n = key.toLowerCase();
  if (/hair|bang|ahoge/.test(n)) return "hair";
  if (/iris|eye(?!brow|line|lash)|highlight|eyewhite|_eye/.test(n))
    return "eyes";
  if (/face|brow|lash|mouth|cheek|eyeline/.test(n)) return "face";
  if (/body|skin/.test(n)) return "skin";
  if (
    /cloth|tops|bottoms|shoes|dress|shirt|skirt|pants|onepiece|sock|jacket|coat/.test(
      n,
    )
  )
    return "clothes";
  if (/acce|hat|glass|ribbon|ear|tail|wing|horn|bag/.test(n))
    return "accessory";
  return "other";
}

/** Short readable label: drops VRoid's numeric prefixes and suffixes. */
export function partLabel(key: string): string {
  const cleaned = key
    .replace(/^N\d+_\d+_(\d+_)?/, "")
    .replace(/_\d+_[A-Z_]+$/, "")
    .replace(/_\d+$/, "")
    .replace(/_/g, " ")
    .trim();
  return cleaned || key;
}
