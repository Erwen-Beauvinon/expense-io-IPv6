#!/usr/bin/env bash
# Drill « toujours le fork » : le hook pre-push refuse l'amont et tout autre
# dépôt, et accepte le fork sous ses formes SSH et HTTPS. Le hook est appelé
# directement (aucun push réel) ; on vérifie aussi la raison du refus.
set -euo pipefail
HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.githooks/pre-push"

expect() { # expect accept|reject URL
  local verdict=$1 url=$2 out code=0
  out="$("$HOOK" origin "$url" 2>&1 </dev/null)" || code=$?
  if [ "$verdict" = accept ] && [ "$code" -ne 0 ]; then
    echo "✗ fork refusé à tort : $url"; echo "$out"; exit 1
  fi
  if [ "$verdict" = reject ] && { [ "$code" -eq 0 ] || ! grep -q 'Push refusé' <<<"$out"; }; then
    echo "✗ push non refusé (ou pour une autre raison) : $url"; echo "$out"; exit 1
  fi
  if [ "$verdict" = accept ]; then echo "✓ accepté  $url"; else echo "✓ refusé   $url"; fi
}

expect accept 'git@github.com:Erwen-Beauvinon/expense-io-IPv6.git'
expect accept 'https://github.com/Erwen-Beauvinon/expense-io-IPv6.git'
expect accept 'https://github.com/Erwen-Beauvinon/expense-io-IPv6'
expect reject 'git@github.com:NathanPrats/expense-io.git'
expect reject 'https://github.com/NathanPrats/expense-io'
expect reject 'git@github.com:Myth-F/expense-io-IPv6.git'
expect reject 'https://github.com/Erwen-Beauvinon/expense-io-IPv6-evil.git'
