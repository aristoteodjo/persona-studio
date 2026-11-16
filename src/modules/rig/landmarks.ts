/** MediaPipe Face Mesh indices. "Left" and "right" are the subject's own sides. */
export const LM = {
  noseTip: 1,
  noseBridge: 168,
  chin: 152,
  foreheadTop: 10,
  cheekRight: 234,
  cheekLeft: 454,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftOuter: 263,
  eyeLeftInner: 362,
  mouthRight: 61,
  mouthLeft: 291,
  mouthInnerRight: 78,
  mouthInnerLeft: 308,
  upperLipInnerMid: 13,
  lowerLipInnerMid: 14,
  lowerLipOuterMid: 17,
} as const;

export const UPPER_LIP_INNER = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
];
export const LOWER_LIP_INNER = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
];
export const UPPER_LIP_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
];
export const LOWER_LIP_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
];

/** Closed loop of the inner mouth, used to cut the hole and draw the mouth interior. */
export const MOUTH_INNER_LOOP = [
  ...UPPER_LIP_INNER,
  ...LOWER_LIP_INNER.slice(1, -1).reverse(),
];

/** Upper and lower lid points of each eye, paired index by index (corner to corner). */
export const EYE_RIGHT_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const EYE_RIGHT_LOWER = [33, 7, 163, 144, 145, 153, 154, 155, 133];
export const EYE_LEFT_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const EYE_LEFT_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362];

export const BROW_RIGHT = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const BROW_LEFT = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
