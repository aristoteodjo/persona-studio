import { lazy, Suspense } from "react";
import { mediaUrl } from "@/modules/avatar/layout";
import { backgroundCss } from "@/modules/avatar/lighting";
import { PngtuberView } from "@/modules/avatar/PngtuberView";
import { PuppetView } from "@/modules/avatar/PuppetView";
import type { Profile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

// three.js only loads when a 3D profile is shown: 2D profiles pay nothing for it.
const VrmView = lazy(() => import("@/modules/avatar/vrm/VrmView"));
const Live2DView = lazy(() => import("@/modules/avatar/live2d/Live2DView"));

type Props = {
  profile: Profile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

/** Renders any profile kind; shared by the studio preview and the OBS overlay. */
export function AvatarStage(props: Props) {
  const { profile, mediaBase } = props;
  const bg = profile.scene.background;
  const css = backgroundCss(
    profile.scene,
    bg.image ? mediaUrl(mediaBase, profile.id, bg.image) : null,
  );
  return (
    <>
      {css ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: css }}
        />
      ) : null}
      <AvatarView {...props} />
    </>
  );
}

function AvatarView({ profile, mediaBase, getFrame, onError }: Props) {
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
    case "live2d":
      return (
        <Suspense fallback={null}>
          <Live2DView
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
