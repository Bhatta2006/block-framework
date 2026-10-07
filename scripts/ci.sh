#!/usr/bin/env bash
#
# Block Framework CI — clean-install verification plus the checks that
# caught real M0 regressions:
#   - npm silently dropping transitive deps (ajv -> fast-uri), exit code 0
#   - tsc -b skipping emit on stale .tsbuildinfo
#   - missing babel-preset-expo breaking `expo export`
#
# Usage: ./scripts/ci.sh
# Exit code is 0 only if every check passes.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
# Scratch space for the emitted-app checks. NOT /tmp: it is a 512M tmpfs
# here and an emitted Expo install (~350M) fills it, causing ENOSPC
# failures that look like real errors.
WORK_DIR="$ROOT/.ci-work"

pass() { echo "  ✅ $1"; }
step() { echo "=== $1 ==="; }

step "1. clean install from scratch"
rm -rf node_modules package-lock.json packages/*/dist packages/*/tsconfig.tsbuildinfo
npm install --no-audit --no-fund
pass "install completed"

step "2. transitive dependency check (npm arborist regression net)"
# M0: npm exited 0 but left ajv's transitive deps uninstalled, crashing at
# runtime. Import them directly — this fails loudly if it ever regresses.
node --input-type=module -e "
await import('ajv');
await import('fast-uri');
await import('require-from-string');
console.log('  ✅ ajv, fast-uri, require-from-string all resolve');
"

step "3. build"
npm run build
for cli in packages/compiler/dist/cli.js packages/benchmark/dist/cli.js; do
  test -f "$cli" || { echo "  ❌ missing build output: $cli"; exit 1; }
done
pass "dist outputs exist"

step "4. unit + render tests"
npm test 2>&1 | grep -E "Test Files|Tests "
pass "tests green"

step "5. lint, typecheck, format"
npm run lint
pass "eslint clean"
npm run typecheck
pass "typecheck clean"
npx prettier --check . > /dev/null
pass "prettier clean"

step "6. compile the example app"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
node packages/compiler/dist/cli.js compile examples/subscription-app/graph.json --out "$WORK_DIR/bf-ci-app"
node packages/benchmark/dist/cli.js run --agent mock --out "$WORK_DIR/bf-ci-bench.json" | tail -1
pass "blockc + bf-bench OK"

step "7. emitted app: install, typecheck, Metro bundle"
cd "$WORK_DIR/bf-ci-app"
npm install --no-audit --no-fund > /dev/null 2>&1
npx tsc --noEmit
pass "emitted app typechecks against Expo SDK types"
if npx expo export --platform android > "$WORK_DIR/bf-ci-export.log" 2>&1; then
  pass "expo export (Metro bundle) succeeded"
else
  echo "  ❌ expo export failed:"
  tail -25 "$WORK_DIR/bf-ci-export.log"
  exit 1
fi
test -f dist/metadata.json || { echo "  ❌ export produced no dist/metadata.json"; exit 1; }
pass "export artifact present"

cd "$ROOT"
rm -rf "$WORK_DIR"

echo ""
echo "🎉 ALL CI CHECKS PASSED"
