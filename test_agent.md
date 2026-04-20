# Running tests

This project uses [Vitest](https://vitest.dev/) for unit tests.

## Prerequisites

- **Node.js** 20 or newer (see `engines` in `package.json`)
- Install dependencies from the repo root:

```bash
npm install
```

## Run all tests once

```bash
npm test
```

This runs `vitest run` (non-interactive, exits when finished).

## Watch mode

Re-run tests when files change:

```bash
npm run test:watch
```

## Test files

Tests live next to source as `*.test.ts` under `src/` (for example `src/ticketText.test.ts`).

## Branching model

Typical flow:

| Branch | Role |
| --- | --- |
| `main` | Release / production-ready code |
| `dev` | Integration branch for ongoing work |
| `feature/**` or `feat/**` | Short-lived branches for a task or ticket |

Create `dev` once if it does not exist yet: `git checkout -b dev` then push and set it as the default for PRs into integration if you prefer.

CI does not depend on branch names for **local** runs; the rules below only affect **GitHub Actions**.

## GitHub Actions

CI is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**When it runs**

- **Push** to **any** branch (every push runs CI).
- **Pull requests** only when the PR **base** is `main` or `dev` (for example `feature/foo` → `dev`, or `dev` → `main`). PRs into other branches do not run this workflow.

On `ubuntu-latest`, the workflow:

1. Checks out the repo
2. Sets up **Node.js 20** with npm caching
3. Runs **`npm ci`**
4. Runs **`npm test`** (Vitest)
5. Runs **`npm run build`** (TypeScript compile)

Status appears under the repository’s **Actions** tab on GitHub. Failed jobs show logs for each step.
