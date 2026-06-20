# Snap build notes

## The bug (fixed)
`npm run dist:snap` (electron-builder 26.x) produced a snap that installed but would
not launch:

    command.sh: line 2: .../desktop-init.sh: No such file or directory

Root cause was in **app-builder-lib's toolset extractor**, not in our config.
electron-builder's snap "template" path downloads
`snap-template-electron-4.0-2-amd64.tar.7z` and is supposed to unpack the launcher
scripts (`desktop-init.sh`, `desktop-common.sh`, `desktop-gnome-specific.sh`) to the
snap root. But `extractArchive()` in `app-builder-lib/out/util/electronGet.js` had no
branch for the **double extension `.tar.7z`** — it ran `7za x` once, which only peels
off the `.7z` layer and leaves the inner `.tar` sitting in the cache. mksquashfs then
copied that raw `.tar` into the snap root unextracted, so the launch scripts
`command.sh` execs were never present.

(The neighbouring `.tar.xz` branch already did the two-step decompress-then-untar; the
`.7z` branch was missing the same treatment.)

## The fix
A `.tar.7z` branch was added to `extractArchive()` mirroring the `.tar.xz` logic:
7za-decompress to a temp dir, find the inner `.tar`, then `tar.extract` it. The fix is
captured as a `patch-package` patch so it survives `npm install`:

- `patches/app-builder-lib+26.15.5.patch`
- `package.json` runs `patch-package` on `postinstall` (and `patch-package` is a devDep).

If electron-builder ships an upstream fix for `.tar.7z` extraction in a future release,
this patch can be dropped (regenerate or delete `patches/` and the `postinstall` hook).

## Approaches tried (for the record)
1. Bumped electron-builder 26.15.3 -> 26.15.5. Did not fix on its own (same extractor bug).
2. `snapcraft:` config key (per the deprecation warning): **rejected by 26.15.5's config
   schema** — build fails validation. Legacy `snap:` key is still the correct one.
3. `useTemplateApp: false` (no-template path, drives real snapcraft): activates, but
   electron-builder's bundled snapcraft.yaml is `base: core20`, which the installed
   **snapcraft 9.0.0 no longer supports** (core20 needs snapcraft 8.x).
4. Direct `snap/snapcraft.yaml` on core24 + gnome extension: blocked here because
   snapcraft needs a build backend — destructive mode refuses (core24 wants a 24.04
   host; this host is 26.04) and no LXD/multipass is installed. Would require a sudo
   install to pursue. Files were removed.

The template path (this fix) needs **no snapcraft and no LXD** — it builds with
mksquashfs directly — so it is the most portable option on this machine.

## Posture preserved
- confinement: strict, grade: stable
- plugs: desktop, desktop-legacy, home, x11, wayland, unity7, browser-support,
  gsettings, audio-playback, pulseaudio, opengl
- **no `network` plug** — the trainer stays fully offline. Audio via
  audio-playback + pulseaudio.
