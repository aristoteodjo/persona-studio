import { describe, expect, it } from "vitest";
import { orbitCamera, type OrbitView } from "@/modules/avatar/orbit";

const view = (v: Partial<OrbitView>): OrbitView => ({
  yaw: 0,
  zoom: 1,
  framing: "bust",
  spin: false,
  ...v,
});

describe("orbit camera", () => {
  it("faces the avatar from the front at yaw 0", () => {
    const c = orbitCamera(view({}), 1.4, 25);
    expect(c.position[0]).toBeCloseTo(0);
    expect(c.position[2]).toBeGreaterThan(0);
    expect(c.position[1]).toBe(c.target[1]);
  });

  it("moves back for wider framings and closer when zooming", () => {
    const d = (v: Partial<OrbitView>) =>
      orbitCamera(view(v), 1.4, 25).position[2];
    expect(d({ framing: "body" })).toBeGreaterThan(d({ framing: "bust" }));
    expect(d({ framing: "bust" })).toBeGreaterThan(d({ framing: "face" }));
    expect(d({ zoom: 2 })).toBeLessThan(d({ zoom: 1 }));
  });

  it("circles around the avatar with yaw", () => {
    const c = orbitCamera(view({ yaw: Math.PI / 2 }), 1.4, 25);
    expect(c.position[0]).toBeGreaterThan(0);
    expect(c.position[2]).toBeCloseTo(0);
  });
});
