# Contributing to Conduit

Thank you for your interest in contributing to Conduit! This guide will help you get started.

## Prerequisites

- [Bun](https://bun.sh/) 1.3+ (primary runtime and package manager)
- [Node.js](https://nodejs.org/) 24+
- Git

## Getting Started

```bash
# Clone the repository
git clone https://github.com/AnoRebel/conduit.git
cd conduit

# Install dependencies (also installs git hooks via lefthook)
bun install

# Build all packages
bun run build

# Run tests to verify everything works
bun run test
```

## Project Structure

```
conduit/
├── packages/
│   ├── client/      # Browser/Node.js client library (conduit)
│   ├── server/      # WebRTC signaling server (@conduit/server)
│   ├── shared/      # Shared types and enums (@conduit/shared)
│   ├── admin/       # Admin API and monitoring (@conduit/admin)
│   └── admin-ui/    # Vue 3/Nuxt 4 dashboard (@conduit/admin-ui)
├── docker/          # Docker configurations
├── .github/         # CI/CD workflows (GitHub Actions)
├── lefthook.yml     # Git hook configuration
├── biome.json       # Linter and formatter configuration
└── tsconfig.base.json # Shared TypeScript configuration
```

## Development Workflow

### Git Hooks

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) and are installed automatically when you run `bun install`.

**Pre-commit** (runs on every commit):
- Lint staged files with Biome
- Format staged files with Biome

**Pre-push** (runs before pushing):
- Type check all packages
- Build all packages

If hooks aren't installed, run manually:

```bash
bunx lefthook install
```

### Common Commands

```bash
# Build all packages (shared is built first automatically)
bun run build

# Build individual packages
bun run build:shared
bun run build:client
bun run build:server
bun run build:admin
bun run build:admin-ui

# Run all tests
bun run test

# Run tests for a specific package
bun run --filter=@conduit/server test
bun run --filter=@conduit/admin test
bun run --filter=conduit test

# Type check all packages
bun run typecheck

# Lint (Biome)
bun run lint

# Lint and auto-fix
bun run lint:fix

# Format code
bun run format

# Check formatting without writing
bun run format:check

# Full validation (equivalent to what CI runs)
bun run lint && bun run format:check && bun run typecheck && bun run build && bun run test
```

### Build Order

Packages have build dependencies. The `@conduit/shared` package must be built first since other packages depend on it. The root `bun run build` script handles this automatically.

## Code Style

Code style is enforced by [Biome](https://biomejs.dev/):

- **Indentation**: Tabs
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Trailing commas**: ES5
- **Line width**: 100 characters
- **Line endings**: LF

### TypeScript

- Strict mode is enabled
- Use `import type` for type-only imports
- Avoid `any` — use `unknown` or specific types
- No unused imports or variables (enforced by Biome)
- Use `node:` protocol for Node.js built-in imports

### Vue (admin-ui)

- Composition API with `<script setup>`
- TypeScript in all components
- shadcn-vue component library

## Running Tests

Tests use [Vitest](https://vitest.dev/):

```bash
# Run all tests across all packages
bun run test

# Run tests for a specific package
bun run --filter=@conduit/server test
bun run --filter=@conduit/admin test
bun run --filter=conduit test

# Run tests in watch mode (within a package directory)
cd packages/server
bun run test -- --watch

# Run a specific test file
cd packages/admin
bun run test -- test/auth.spec.ts
```

The project currently has **436 tests** across all packages.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, no logic change) |
| `refactor` | Code refactoring (no feature or fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI/CD configuration changes |
| `chore` | Other changes (e.g., updating git hooks) |

### Scopes

Use the package name as scope: `client`, `server`, `shared`, `admin`, `admin-ui`, or omit for monorepo-wide changes.

### Examples

```bash
git commit -m "feat(server): add WebSocket compression support"
git commit -m "fix(admin): handle race condition in metrics collection"
git commit -m "docs: update README with new CLI flags"
git commit -m "test(client): add transport fallback integration tests"
```

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Implement** your changes following the code style and conventions above.

3. **Add tests** for any new functionality or bug fixes.

4. **Verify** everything passes:
   ```bash
   bun run lint && bun run format:check && bun run typecheck && bun run build && bun run test
   ```

5. **Commit** your changes using conventional commits.

6. **Push** your branch and open a Pull Request against `main`.

7. **Describe** your changes clearly in the PR description — what changed, why, and how to test it.

### PR Checklist

- [ ] Tests added/updated for changes
- [ ] All tests pass (`bun run test`)
- [ ] Linting passes (`bun run lint`)
- [ ] Formatting passes (`bun run format:check`)
- [ ] Type checking passes (`bun run typecheck`)
- [ ] Build succeeds (`bun run build`)
- [ ] Documentation updated if applicable

## CI/CD

Pull requests and pushes to `main` trigger GitHub Actions workflows:

- **Lint & Format** — Biome checks
- **Type Check** — TypeScript compiler
- **Build** — Full monorepo build
- **Unit Tests** — All tests with coverage

Releases trigger additional workflows:
- **NPM Publishing** — Via OIDC trusted publishing (no token secrets needed)
- **JSR Publishing** — Via OIDC authentication
- **Docker Images** — Built and pushed for server, server-admin, and admin-ui

## Getting Help

- Open a [GitHub Issue](https://github.com/AnoRebel/conduit/issues) for bugs or feature requests
- Check existing issues before creating new ones
- Provide reproduction steps for bug reports

## License

By contributing to Conduit, you agree that your contributions will be licensed under the MIT License.
