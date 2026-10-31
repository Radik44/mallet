# Mallet

<p align="center"><img src="brand/mallet.png" width="128" alt="Mallet"></p>

**Mallet is a modern map editor for Garry's Mod and other Source engine games - the same VMF files and the same compilers as Hammer, with an interface from this decade.** Free, source included, open to testers: this is **demo 0.1**, rough around the edges and published to be tried on real maps.

[![Download](https://img.shields.io/badge/Download-Windows%20installer-2a9dae?style=for-the-badge)](https://github.com/Radik44/mallet/releases/latest)
[![Support on Patreon](https://img.shields.io/badge/Support-Patreon-ff6b8a?style=for-the-badge)](https://www.patreon.com/mallet_official)
[![License](https://img.shields.io/badge/License-free%20%26%20stays%20free-555?style=for-the-badge)](LICENSE)

[Русская версия](README.ru.md)

## Highlights

- Four dockable views, a Unity-style inspector, compile errors explained with a **Fix** button.
- A built-in assistant (Claude) that builds rooms, places entities, writes Lua, compiles and launches the game - step by step, every step undoable.
- Live link to the running game: teleport, camera sync, screenshots from the player's eyes, "rebuild and show me" in one click.
- Displacement landscape brush, texture painter, sound editor, prefabs, notes pinned to the map, version history with diffs.
- Ten interface languages, dark and light themes, a 6 MB installer; game content comes from your own Garry's Mod via Steam.

## System requirements

| | Minimum |
| --- | --- |
| OS | Windows 10 (1809 or newer) or Windows 11, 64-bit |
| Graphics | A GPU and driver with Direct3D 12 support (Mallet renders through WebGPU; integrated graphics from 2016 on are fine) |
| Memory | 4 GB RAM; 8 GB recommended for large maps |
| Disk | 30 MB for the editor, plus a few hundred MB of cache for the game's textures and models |
| Game | Garry's Mod installed through Steam - textures, models, sounds and the compilers (vbsp, vvis, vrad) are read from your copy; without it the editor runs, but without game content |
| Runtime | Microsoft Edge WebView2 - bundled with the installer, nothing to install by hand |
| Assistant (optional) | Internet access and either a Claude subscription (Claude Code is a component of the installer and a button in the assistant's settings) or an Anthropic API key |

No Node.js, Python or other developer tools are needed to run Mallet. The installer needs no administrator rights.

## Install

1. Download `Mallet_<version>_x64-setup.exe` from the [latest release](https://github.com/Radik44/mallet/releases/latest).
2. Run it. The installer is not code-signed yet, so SmartScreen asks once: *More info → Run anyway*.
3. Pick the installer's language, read the licence (the **Next** button opens after a short countdown) and choose the components: the editor and WebView2 are required, **Assistant: Claude Code** is optional and runs Anthropic's official installer (internet, about a minute). The editor starts in the installer's language.
4. The editor finds Garry's Mod through Steam on its own and loads the game's content. Read the author's note, choose the Hammer lesson or the full tutorial, or skip both.

## What it does

- **Views and tools.** Four views as in Hammer, dockable panels, views that drag out into separate windows. Brushes, textures with a preview while dragging, entities from the game's FGD, displacements, instances, prefabs, visgroups, a problem checker with automatic fixes.
- **Inspector** in the Unity style: a transform with gizmos, colour and angle pickers, a light card, a model picker.
- **Landscape brush** as in Unreal: a wizard makes a ground plane out of stitched displacements; the brush raises, smooths, flattens, adds noise and paints the blend alpha right in the 3D view, across seams.
- **Sounds:** a browser of the game's sounds with playback, and an editor - trim, seamless loop with crossfade, volume and fades, microphone recording, 16-bit WAV into the map's project, `ambient_generic` by drag and drop with a card for volume, radius, loop and pitch.
- **Texture painter:** a 64…1024 canvas with layers, brush, pencil, eraser, line, rectangle, fill, picker, text, an image or a game texture as a layer, seamless mode with a 3×3 tile preview, mirror; VTF+VMT saved into the map's project with a shader of your choice and applied to the selected faces at once.
- **Project file** `<map>.mallet.json` next to the VMF: the map's goal from the wizard, what was compiled, checked and tested; the assistant sees it in its summary.
- **Compile analysis:** familiar log errors (a leak, no skybox, a missing material, a broken brush, Lua errors in the game console) are explained in words and fixed with one button; the rest goes to the assistant together with the log via **Ask the assistant**, the same button as in **Problems**.
- **A look from the game:** screenshots of what the player sees right in the editor, a live view once a second, a one-button test cycle "rebuild and show me" (save, compile, reload the map in the game or launch it, put the player at the editor's camera, take a shot), noclip and HUD from buttons. The assistant receives the shots as images and checks its own work; it has direct access to the game - Lua on both sides, console commands with output, ray casts, light probes, a quiet console, free-camera shots and frame series, the game's exit reason, face search by material, file and VTF header checks, the editor's own camera and screenshot.
- **Claude assistant:** a chat that builds brushes and rooms, places entities and outputs, writes Lua into the map's project (with confirmation and a diff), compiles and launches the game. The reply streams in as it arrives, every tool call shows up as a card and runs at once, it never touches your panels or camera; you can return to the state before any step, and its steps are marked ✦ in **History**. Runs through a local Claude Code on your subscription (the editor starts an MCP server with its own tools for it) or through an API key kept in the Windows credential store - the key never reaches the editor's window.
- **Compile and pack:** vbsp, vvis and vrad with log analysis, leaks and portals, content packing into the BSP, decompiling a BSP back to VMF.
- **Game link:** launch Garry's Mod on the map, teleport, camera, entity transfer, cubemaps in one button.
- **Ten interface languages** (English, Russian, German, French, Spanish, Portuguese, Polish, Turkish, Ukrainian, Chinese, Japanese), including undo labels and check texts from the core; dark and light themes.
- **First-run wizard,** a full tutorial for newcomers and a short lesson for Hammer users.

## Privacy and licence

Mallet collects no telemetry and sends no files anywhere by itself. The assistant, when and only when you use it, sends your request, a summary of the map and tool results to Anthropic's services under Anthropic's terms. Everything you make with Mallet is yours alone. The program is free and must stay free; see [LICENSE](LICENSE).

Garry's Mod, Source and Hammer are the property of Facepunch Studios and Valve Corporation. Mallet is an independent project, not affiliated with or endorsed by them.

## Building from source

Rust stable with the `wasm32-unknown-unknown` target, Node.js 24 and pnpm 10; on Windows, Visual Studio Build Tools and WebView2.

```bash
pnpm install
pnpm dev
```

The installer is built with `pnpm --filter @gme/editor tauri build --bundles nsis`; it lands in `target/release/bundle/nsis/`.

## Feedback

Bugs and ideas: [Issues](https://github.com/Radik44/mallet/issues). Support the development: [Patreon](https://www.patreon.com/mallet_official).

## The name

A mallet is Hammer's younger sibling. Cache and prefabs live in `%LOCALAPPDATA%\mallet` and `%APPDATA%\mallet`; the application id is `dev.mallet.editor`.
