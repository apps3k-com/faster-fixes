# Changesets

Each file in this folder (other than this README and `config.json`) describes one pending release: which of the `@fasterfixes/*` packages changed, the semver bump, and the changelog entry users will read.

Write one with the `/release` skill or `pnpm changeset`. The release workflow consumes these files on `main`: it opens a "Version Packages" PR, and merging that PR publishes to npm. Documentation: https://changesets.dev.
