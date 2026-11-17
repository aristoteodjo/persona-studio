/** Secret of the local overlay server, required on /ws and /media. */
let key = "";

export const setOverlayKey = (k: string) => {
  key = /^[0-9a-f]{32}$/.test(k) ? k : "";
};

export const overlayKey = () => key;
