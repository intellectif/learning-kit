# Learning Kit

A modern, TypeScript-first SDK for building interactive educational activities with xAPI tracking. A lightweight, composable alternative to H5P built for React 19.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@intellectif/lk-core`](./packages/lk-core) | Schemas, scoring engine, xAPI builder | V1 MVP |
| [`@intellectif/lk-react`](./packages/lk-react) | React 19 components, hooks, theming | V1 MVP |
| [`@intellectif/lk-server`](./packages/lk-server) | Server-side utilities | Phase 3 |
| [`@intellectif/lk-ai`](./packages/lk-ai) | AI content generation | Phase 3 |

## Features

- **Schema-first** — Zod schemas are the single source of truth; JSON Schema exported automatically
- **Pure scoring engine** — deterministic, side-effect-free, 100% test coverage enforced
- **xAPI 1.0.3** — well-formed statements out of the box with configurable LRS delivery
- **CSS-variable theming** — zero build-time config, works with Tailwind and vanilla CSS
- **WCAG 2.2 AA** — accessibility is a first-class constraint, not an afterthought
- **Composable** — tree-shakeable exports, each activity component under 50 KB gzipped

## Requirements

- Node.js 20 or 22
- pnpm 11+
- React 19 (for `lk-react`)

## Getting Started

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Clone and install
git clone https://github.com/intellectif/learning-kit.git
cd learning-kit
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Development

```bash
# Run all packages in watch mode
pnpm dev

# Run the lint suite
pnpm lint

# Generate a coverage report
pnpm coverage
```

## Releasing

This monorepo uses [Changesets](https://github.com/changesets/changesets) for independent package versioning.

```bash
# Describe a change
pnpm changeset

# Bump versions according to pending changesets
pnpm version-packages

# Publish to npm (CI handles this automatically on merge to main)
pnpm release
```

## License

MIT © [Intellectif LLC](https://intellectif.com)
