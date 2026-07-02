#!/usr/bin/env bash
# Test de concurrencia del backend: subidas en paralelo, dedupe bajo carrera,
# claim atómico sin duplicados, y recuperación de cola trabada.
set -u
# Config por entorno (con defaults). Ver tests/README.md.
B="${BASE:-http://127.0.0.1:8040}"
PK="${PRINTER_KEY:-pk}"; PP="${PANEL_PASSWORD:-1313}"
IMG="$1"      # PNG 1200x1776 de prueba
WORK="$2"     # carpeta temporal para respuestas
fail=0
rm -rf "$WORK"; mkdir -p "$WORK/uniq" "$WORK/dup" "$WORK/claim"

extract_id() { python3 -c "import sys,json
try: print(json.load(sys.stdin)['id'])
except Exception: pass"; }
export -f extract_id
export B PK PP IMG WORK

echo "=== 30 subidas en paralelo, claves únicas -> 30 trabajos distintos ==="
seq 1 30 | xargs -P 30 -I{} bash -c '
  curl -s -X POST "$B/api/jobs" -H "Idempotency-Key: uniq-{}" \
    -F "image=@$IMG;type=image/png" -F "name=G{}" | extract_id > "$WORK/uniq/{}"'
n_distinct=$(cat "$WORK"/uniq/* | sort -u | grep -c .)
echo "trabajos distintos creados: $n_distinct (esperado 30)"
[ "$n_distinct" = "30" ] || { echo "FAIL unique uploads"; fail=1; }

echo "=== 12 subidas en paralelo, MISMA clave -> 1 solo trabajo (dedupe) ==="
seq 1 12 | xargs -P 12 -I{} bash -c '
  curl -s -X POST "$B/api/jobs" -H "Idempotency-Key: SAME-KEY" \
    -F "image=@$IMG;type=image/png" -F "name=DUP" | extract_id > "$WORK/dup/{}"'
d_distinct=$(cat "$WORK"/dup/* | sort -u | grep -c .)
echo "trabajos distintos con misma clave: $d_distinct (esperado 1)"
[ "$d_distinct" = "1" ] || { echo "FAIL dedupe under concurrency"; fail=1; }

total=$(curl -s "$B/api/panel/queue" -H "Authorization: Bearer $PP" | python3 -c "import sys,json;print(json.load(sys.stdin)['counts']['total'])")
echo "total trabajos: $total (esperado 31)"
[ "$total" = "31" ] || { echo "FAIL total count"; fail=1; }

echo "=== 40 claims del agente en paralelo -> sin id duplicado (claim atómico) ==="
seq 1 40 | xargs -P 40 -I{} bash -c '
  curl -s "$B/api/agent/next" -H "Authorization: Bearer $PK" | extract_id > "$WORK/claim/{}"'
c_total=$(cat "$WORK"/claim/* | grep -c .)
c_distinct=$(cat "$WORK"/claim/* | sort -u | grep -c .)
echo "claims con trabajo: $c_total, distintos: $c_distinct (iguales; 31)"
[ "$c_total" = "$c_distinct" ] || { echo "FAIL: un trabajo reclamado dos veces"; fail=1; }
[ "$c_distinct" = "31" ] || { echo "FAIL: no se reclamaron los 31"; fail=1; }

q=$(curl -s "$B/api/panel/queue" -H "Authorization: Bearer $PP" | python3 -c "import sys,json;c=json.load(sys.stdin)['counts'];print(c['queued'],c['printing'])")
echo "queued printing = $q (esperado '0 31')"
[ "$q" = "0 31" ] || { echo "FAIL: estado tras claim inconsistente"; fail=1; }

echo "=== recuperación de cola trabada (PRINTING_TIMEOUT_S=1): esperar y re-claim ==="
sleep 2
recovered=$(curl -s "$B/api/agent/next" -H "Authorization: Bearer $PK" | python3 -c "import sys,json
try: print(json.load(sys.stdin)['id'])
except Exception: print('NONE')")
echo "re-claim tras timeout devolvió: ${recovered:0:12}… (no NONE)"
[ "$recovered" != "NONE" ] || { echo "FAIL: cola trabada no se recuperó"; fail=1; }

if [ "$fail" = "0" ]; then echo "ALL_CONCURRENCY_PASS"; else echo "CONCURRENCY_FAILURES"; fi
exit $fail
