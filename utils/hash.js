import { sha1 } from "js-sha1";

export function fingerprint(path, line) {
  return sha1(`${path}:${line}`).slice(0, 12);
}
