# Contributing to Cadence

Thanks for your interest! Bug reports, feature ideas and pull requests are all welcome.

## Reporting bugs

Open an issue with:
- What you did and what happened vs. what you expected.
- Your Windows version and whether you have an NVIDIA GPU.
- Relevant lines from the app log (**Settings → About → Open logs**, or
  `%APPDATA%\transcriber\logs\main.log`). Please redact any API keys/tokens.

## Development

```bash
npm install
npm run dev          # run with hot reload
npm run typecheck    # must pass before a PR
npm run build:win    # produce the installer + portable build
```

- Main process: `src/main/` · Preload bridge: `src/preload/` · UI: `src/ui/` ·
  Shared types/IPC/i18n: `src/shared/` · Local ML worker: `ml/`.
- Keep `npm run typecheck` green. Match the existing code style (Prettier/ESLint config in repo).
- UI strings go through the i18n dictionary in `src/shared/i18n.ts` (don't hardcode user-facing text).

## Pull requests

- Keep PRs focused; describe the change and how you tested it.
- By contributing you agree your work is licensed under the project's [MIT License](LICENSE).
