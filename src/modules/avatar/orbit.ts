export type Framing = "face" | "bust" | "body";

/** Free camera used by the Atelier; read every frame, never through React. */
export type OrbitView = {
  yaw: number;
  zoom: number;
  framing: Framing;
  spin: boolean;
};

export type OrbitCamera = {
  position: [number, number, number];
  target: [number, number, number];
};

/**
 * Places the camera on a circle around the avatar. `headY` is the eye height
 * in meters; framing heights scale with it so tall and chibi avatars both fit.
 */
export function orbitCamera(
  view: OrbitView,
  headY: number,
  fovDeg: number,
): OrbitCamera {
  const height =
    view.framing === "face"
      ? headY * 0.4
      : view.framing === "bust"
        ? headY * 0.68
        : headY * 1.32;
  const y =
    view.framing === "face"
      ? headY
      : view.framing === "bust"
        ? headY * 0.87
        : headY * 0.6;
  const visible = height / view.zoom;
  const dist = visible / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return {
    position: [Math.sin(view.yaw) * dist, y, Math.cos(view.yaw) * dist],
    target: [0, y, 0],
  };
}
