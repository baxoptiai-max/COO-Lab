#!/usr/bin/env bash
# Tripwire: blocks publishing when a confidential term appears in project files.
cd "$(dirname "$0")/.." || exit 1
LIST="_private/forbidden-terms.txt"
if [ ! -s "$LIST" ]; then echo "BLOCKED: $LIST is missing or empty."; exit 1; fi
HITS=$(grep -rniIF -f "$LIST" . --exclude-dir=.git --exclude-dir=_private --exclude-dir=node_modules --exclude=check-confidential.sh --exclude=CLAUDE.md 2>/dev/null)
if [ -n "$HITS" ]; then echo "BLOCKED: confidential terms found:"; echo "$HITS"; exit 1; fi
echo "OK: no confidential terms found."; exit 0
