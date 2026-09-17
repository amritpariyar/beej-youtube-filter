#!/bin/sh
# Every suite reads the real source files; none of them stub the logic they test.
cd "$(dirname "$0")/../.."
fail=0
for t in tools/test/test_*.js; do
  if node "$t" >/dev/null 2>&1; then
    echo "pass  $(basename "$t" .js)"
  else
    echo "FAIL  $(basename "$t" .js)"
    node "$t" 2>&1 | grep -E '^FAIL|Error' | head -5
    fail=1
  fi
done
exit $fail
