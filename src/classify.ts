import type { FileKind } from "./types.js";

const TEST_PATTERNS: RegExp[] = [
  /(^|\/)test_[^/]*\.py$/,
  /(^|\/)[^/]*_test\.py$/,
  /(^|\/)conftest\.py$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
];

// Dependency manifests, lockfiles and tool config stay at their head version during
// the red run: the new tests need the new environment, only the code under test goes back.
const INFRA_PATTERNS: RegExp[] = [
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)(yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/,
  /(^|\/)(pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|pytest\.ini|poetry\.lock|uv\.lock|Pipfile(\.lock)?)$/,
  /(^|\/)requirements[^/]*\.txt$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)(vitest|jest|vite)\.config\.[cm]?[jt]s$/,
  /(^|\/)\.github\//,
  /(^|\/)receipts\.json$/,
];

export function classify(path: string): FileKind {
  if (INFRA_PATTERNS.some((re) => re.test(path))) return "infra";
  if (TEST_PATTERNS.some((re) => re.test(path))) return "test";
  return "source";
}
