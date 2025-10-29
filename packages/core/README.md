# packages/core

Core utilities, shared types, and common building blocks used across the USDL Monorepo.

This package contains reusable code (types, helpers, constants, error types, and small utilities) that other packages in the monorepo depend on. Keeping these in a single package reduces duplication and makes cross-project changes easier.

> Note: Replace occurrences of `@usdl/core` below with the actual package name defined in packages/core/package.json if it differs.

## Table of contents

- [Why this package exists](#why-this-package-exists)
- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [API overview (examples)](#api-overview-examples)
- [Development](#development)
- [Testing](#testing)
- [Publishing](#publishing)
- [Contributing](#contributing)
- [License](#license)

## Why this package exists

Centralize code that needs to be shared between multiple packages in the monorepo:

- Shared TypeScript types and interfaces
- Utility functions (formatters, validators, etc.)
- Common constants and configuration defaults
- Custom errors and logging helpers
- Small, dependency-free helpers that should not be duplicated

This keeps other packages small and focused, and makes refactoring or bug fixing easier.

## Features

- Lightweight, dependency-minimal building blocks
- Strictly typed TypeScript exports for consistent usage across packages
- Tests for core utilities (if present)
- Ready to be consumed by other workspace packages via workspace imports

## Installation

If you're working inside the monorepo, you typically don't need to install anything — use your package manager's workspace linking (pnpm/yarn/npm).

Examples:

- Using pnpm (recommended for monorepos):

  - From the repo root, install dependencies:
    pnpm install

  - From other packages in the workspace, import the core package with the package name in package.json (e.g. `@usdl/core`):
    import { something } from '@usdl/core'

- If the package is published to a registry, install it like any other package:
  npm install @usdl/core
  or
  yarn add @usdl/core
  or
  pnpm add @usdl/core

Note: Confirm the package name in packages/core/package.json.

## Quick start

1. From repo root:
   - Install: pnpm install
   - Build all workspace packages: pnpm -w build (or run build in this package)

2. Develop in watch mode (if scripts exist):
   - cd packages/core
   - pnpm dev
   - or pnpm watch

3. Use the core package in other workspace packages:
   - import { validateX, DEFAULT_CONFIG } from '@usdl/core'

## API overview (examples)

This README purposely stays generic because exact exports depend on the actual source. Below are examples of typical exports and usage patterns you can copy/adapt.

Example: shared types
```ts
// packages/core/src/types.ts (example)
export type Id = string | number;
export interface Pagination { page: number; pageSize: number; }
```

Example: utilities
```ts
// usage in another package
import { isValidId, formatDate } from '@usdl/core';

if (!isValidId(id)) throw new Error('invalid id');
console.log(formatDate(new Date()));
```

Example: constants
```ts
import { DEFAULT_TIMEOUT, APP_NAME } from '@usdl/core';

console.log(`${APP_NAME} timeout=${DEFAULT_TIMEOUT}ms`);
```

If you want this file to include a generated API reference, provide the exports or point me to packages/core/src so I can extract the actual exported functions/types.

## Development

Recommended workflow inside the monorepo:

- Use a workspace-aware package manager (pnpm, Yarn workspaces).
- Keep changes to core small and well-tested — many packages depend on it.
- Use semantic versioning for published releases of the core package.
- When changing types, consider the impact on dependent packages and coordinate cross-package updates.

Suggested scripts (check packages/core/package.json for exact names):
- pnpm build — compile TypeScript
- pnpm test — run unit tests
- pnpm lint — run linter
- pnpm typecheck — run TypeScript type checks

## Testing

- Write unit tests for utilities and important logic.
- Keep tests fast and deterministic.
- Run tests locally before opening a PR: pnpm test
- CI should run linting, typecheck, and tests on PRs.

## Publishing

If you publish this package separately from the monorepo:

- Ensure package.json `name`, `version`, `publishConfig`, and `files` are correct.
- Use a release workflow (e.g., semantic-release) or manual changelogs and npm publish.
- When releasing a new major or breaking change, coordinate with teams that consume this package.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repo and create a branch for your change.
2. Add or update tests for any new behavior.
3. Run the test suite and linters.
4. Open a pull request describing the change, motivation, and any migration steps (if breaking).

Please follow the repository's commit message and PR guidelines.

## Troubleshooting

- If imports fail when developing locally, ensure the monorepo workspace is bootstrapped: pnpm install
- If TypeScript path or type errors occur, run pnpm typecheck in the repo root or in this package.
- For runtime behavior differences, add focused unit tests to reproduce and fix.

## License

This package is licensed under the MIT License. See the repository LICENSE file for details.

## Maintainers / Contact

Maintained as part of the USDL Monorepo by the repository maintainers. For questions or to report issues, open an issue in the monorepo or reach out to the maintainers listed in the repository.
