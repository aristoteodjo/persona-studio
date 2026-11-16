import { lazy, Suspense } from "react";
import { PngtuberView } from "@/modules/avatar/PngtuberView";
import { PuppetView } from "@/modules/avatar/PuppetView";
import type { Profile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

// three.js only loads when a 3D profile is shown: 2D profiles pay nothing for it.
const VrmView = lazy(() => import("@/modules/avatar/vrm/VrmView"));

type Props = {
  profile: Profile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

/** Renders any profile kind; shared by the studio preview and the OBS overlay. */
export function AvatarStage({ profile, mediaBase, getFrame, onError }: Props) {
  switch (profile.kind) {
    case "pngtuber":
      return (
        <PngtuberView
          profile={profile}
          mediaBase={mediaBase}
          getFrame={getFrame}
        />
      );
    case "puppet":
      return (
        <PuppetView
          key={profile.id}
          profile={profile}
          mediaBase={mediaBase}
          getFrame={getFrame}
          onError={onError}
        />
      );
    case "vrm":
      return (
        <Suspense fallback={null}>
          <VrmView
            key={profile.id}
            profile={profile}
            mediaBase={mediaBase}
            getFrame={getFrame}
            onError={onError}
          />
        </Suspense>
      );
  }
}
