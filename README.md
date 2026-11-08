# Live for Backlog

> Keep [Backlog](https://backlog.com/) alive without reloading.

Click the extension's toolbar icon to open its options in the browser's
extension settings. Clicking it on a Backlog page suggests that space for adding.

## Develop

Install [Vite+](https://viteplus.dev/guide/) 1.5.0. The project pins Node.js
26.13.0 in `.node-version` and pnpm 12.18.0 in `package.json`; `vp` manages both.

```sh
vp install --frozen-lockfile
vp run dev          # Chrome
vp run dev:firefox  # Firefox
```

The install prepares WXT and enables the Git hooks. Pre-commit formats staged
files with Biome 2.4.15 and stages the fixes; pre-push runs Biome, type checking,
and tests.

To reproduce the Firefox build from a clean source checkout or archive (including
for AMO review), use the same Vite+ and Node.js versions:

```sh
VP_GIT_HOOKS=0 vp install --frozen-lockfile
vp env current
vp run build:firefox
vp run lint:firefox
```

The unpacked Firefox MV3 extension is written to `.output/firefox-mv3/`.
`vp run zip:firefox` builds the distributable archive. For Chrome, use
`vp run build` (output: `.output/chrome-mv3/`).

## License

[MIT](LICENSE)
