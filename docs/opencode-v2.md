# OpenCode v2 compatibility adapter (candidate)

This branch adds a default `{ id, setup }` plugin for OpenCode v2 while
preserving the existing V1 named exports. It reuses the original Makefile,
package.json, skill discovery, configuration, command names, and collision
resolution without invoking project shell commands itself.

## Verify first

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
```

Then smoke-test in an isolated temporary OpenCode 2.3.0 environment before
enabling this globally. Ensure both `make:*` and `npm:*` commands appear,
check argument substitution, configured prefixes, already registered names,
skills, and disabled sources. Never point the smoke test at a production
repository or enable Command Inject in the existing Don-Squad setup before
verification.

## Scope and limitations

- V2 commands are constructed at plugin setup time. Changes to project sources
  need a plugin reload.
- The legacy V1 `config` and `command.execute.before` hooks are retained
  for older clients but are not registered in V2.
- No direct shell execution, file mutation, network access, or permission bypass
  is performed by the adapter.
- Compatibility remains unverified against the real OpenCode 2.3.0 runtime
  until a smoke test passes. This branch is not a release.
