/**
 * Browser compatibility shim.
 *
 * Chrome MV3 exposes promise-based `chrome.*`; Firefox exposes `browser.*`.
 * All extension API access goes through this module so a future Firefox or
 * Safari port only has to adjust one file.
 */

declare const browser: typeof chrome | undefined;

export const ext: typeof chrome =
  typeof browser !== 'undefined' ? browser : chrome;

/** True when running inside an extension context (not a test). */
export function hasExtensionApis(): boolean {
  try {
    return typeof ext !== 'undefined' && !!ext.runtime?.id;
  } catch {
    return false;
  }
}
