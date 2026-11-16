import { describe, expect, it } from "vitest";
import { classifyImage, packExpressions } from "@/modules/profiles/pack";

describe("pack import", () => {
  it("maps common file names to states", () => {
    expect(classifyImage("/a/EyesOpenMouthClosed.png")).toBe("idle");
    expect(classifyImage("/a/EyesOpenMouthOpen.png")).toBe("talk");
    expect(classifyImage("/a/EyesClosedMouthClosed.png")).toBe("blink");
    expect(classifyImage("/a/EyesCloseMouthOpen.png")).toBe("talkBlink");
    expect(classifyImage("/a/Eyes Closed Mouth Open.png")).toBe("talkBlink");
    expect(classifyImage("C:\\pack\\idle.png")).toBe("idle");
    expect(classifyImage("/a/talk_blink.png")).toBe("talkBlink");
  });

  it("ignores cover art", () => {
    expect(classifyImage("/a/Cover Image.png")).toBeNull();
    expect(classifyImage("/a/Profile Image.png")).toBeNull();
  });

  it("builds one expression per folder with a resting image", () => {
    const exprs = packExpressions([
      {
        name: "Light Skin PNGtuber",
        files: ["/p/Cover Image.png", "/p/Profile Image.png"],
      },
      {
        name: "Light Skin Normal Chat",
        files: [
          "/c/EyesClosedMouthClosed.png",
          "/c/EyesClosedMouthOpen.png",
          "/c/EyesOpenMouthClosed.png",
          "/c/EyesOpenMouthOpen.png",
        ],
      },
    ]);
    expect(exprs).toHaveLength(1);
    expect(exprs[0]?.name).toBe("Light Skin Normal Chat");
    expect(exprs[0]?.slots).toEqual({
      blink: "/c/EyesClosedMouthClosed.png",
      talkBlink: "/c/EyesClosedMouthOpen.png",
      idle: "/c/EyesOpenMouthClosed.png",
      talk: "/c/EyesOpenMouthOpen.png",
    });
  });
});
