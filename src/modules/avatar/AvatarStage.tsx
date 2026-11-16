import { PngtuberView } from "@/modules/avatar/PngtuberView";
import { PuppetView } from "@/modules/avatar/PuppetView";
import type { Profile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

type Props = {
  profile: Profile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

/** Renders any profile kind; shared by the studio preview and the OBS overlay. */
export function AvatarStage({ profile, mediaBase, getFrame, onError }: Props) {
  return profile.kind === "pngtuber" ? (
    <PngtuberView profile={profile} mediaBase={mediaBase} getFrame={getFrame} />
  ) : (
    <PuppetView
      key={profile.id}
      profile={profile}
      mediaBase={mediaBase}
      getFrame={getFrame}
      onError={onError}
    />
  );
}
