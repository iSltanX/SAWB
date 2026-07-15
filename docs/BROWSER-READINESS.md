# Safari & Firefox readiness — SAWB v1.1.0

The extension is a standard WebExtension (MV3) with a deliberately small API
surface. All extension-API access goes through `src/platform/ext.ts`
(`globalThis.browser ?? chrome`), so no call sites need to change for either
port.

## API surface used

| API | Chrome | Firefox | Safari (16.4+) |
|---|---|---|---|
| `storage.local` + `onChanged` | ✅ | ✅ | ✅ |
| `runtime.id / onMessage / onInstalled / getManifest / openOptionsPage` | ✅ | ✅ | ✅ |
| `tabs.query({active}) / tabs.sendMessage` (no permission needed) | ✅ | ✅ | ✅ |
| `commands.onCommand` (4 shortcuts) | ✅ | ✅ | ✅ (user-assignable) |
| MV3 `background.service_worker` | ✅ | ❌ (uses event page) | ✅ |

No `eval`, no remote code, no network, no DOM APIs outside Baseline.

## Firefox — required manifest deltas (packaging-time only)

1. `background: { "scripts": ["worker.js"] }` instead of `service_worker`
   (Firefox MV3 uses event pages; the worker code itself is compatible —
   top-level listeners only, no state).
2. Add `browser_specific_settings.gecko.id` (e.g. `sawb@example`) and
   `strict_min_version: "115.0"`.
3. `options_ui.open_in_tab` — supported as-is.
4. Everything else (content scripts, commands, storage, icons) — unchanged.

Suggested approach: a `--firefox` flag in `scripts/build.mjs` that patches the
manifest during the copy step. Not shipped: Firefox cannot be verified in this
environment (see final report).

## Safari — `safari-web-extension-converter` steps

```
xcrun safari-web-extension-converter dist/ \
  --project-location safari/ --app-name "SAWB" --macos-only
```

Then in Xcode: set bundle identifiers, enable the extension target, archive.

Compatibility risks to check during Safari verification:
- Non-persistent background: our worker only registers listeners at top level
  and keeps no state — compatible by construction.
- `commands` default shortcuts: Safari may require the user to assign keys in
  Settings → Extensions; document in the store listing.
- Arabic `name` in the manifest renders fine, but the App Store listing name
  comes from the Xcode project, not the manifest.
- Popup width: Safari respects body width (340px) as Chrome does.

## Remaining browser-specific code

None in `src/`. The only divergence is the manifest `background` key for
Firefox, handled at packaging time.
