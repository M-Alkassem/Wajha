#!/usr/bin/env bash
# Desktop smoke test: runs the app in self-test mode (see
# src/ui/shell/selfTest.ts), waits for its report, checks the exported files
# and reports memory per phase (idle after launch, export, idle editor, idle
# home screen after closing the project).
#
# The self-test ends by renaming the project and quitting at once through the
# shell's exit hold, the path Cmd+Q takes. The app must then end by itself,
# which only the frontend's answer to wajha://before-exit does in time, with
# the new name saved.
#
# The self-test exists only in builds with the `self-test` cargo feature;
# shipped builds ignore WAJHA_SELF_TEST_DIR. So the script first builds one
# (release, no installer) into src-tauri/target/release/wajha:
#
#   npx tauri build --no-bundle --features self-test
#
# To run a binary you built that way yourself, skip the build with
#
#   APP_BIN=path/to/wajha bash scripts/desktop-smoke.sh
#
# Run `npm run desktop:build` afterwards for an installer: it rebuilds the
# binary without the feature.
#
# Memory is the app process plus the WebKit helper processes it started
# (WKWebView helpers are launched by the system, not as children of the app,
# so they are matched by PID order; WebKit builds from Playwright are skipped).
# "footprint" is what Activity Monitor shows (macOS only); RSS counts shared
# pages too and reads higher.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${APP_BIN:-}" ]]; then
  npx tauri build --no-bundle --features self-test
  APP_BIN=src-tauri/target/release/wajha
fi
if [[ ! -x "$APP_BIN" ]]; then
  echo "App binary not found at $APP_BIN." >&2
  exit 1
fi

# An explicit template: a bare `mktemp -d` ignores TMPDIR on recent macOS.
OUT="$(mktemp -d "${TMPDIR:-/tmp}/wajha-smoke.XXXXXX")/wajha-self-test"
mkdir -p "$OUT"
SAMPLES="$OUT/../memory.tsv"
: > "$SAMPLES"
echo "Running $APP_BIN with WAJHA_SELF_TEST_DIR=$OUT"
WAJHA_SELF_TEST_DIR="$OUT" "$APP_BIN" &
PID=$!

app_pids() {
  ps -axo pid=,command= | awk -v pid="$PID" '$1 >= pid && $0 !~ /ms-playwright/ && ($1 == pid || $0 ~ /com\.apple\.WebKit\./) {print $1}'
}

STARTED=$SECONDS
for _ in $(seq 1 240); do
  [[ -f "$OUT/report.json" ]] && break
  # The self-test names its first phase within seconds of the window opening.
  if [[ ! -f "$OUT/phase.txt" ]] && (( SECONDS - STARTED >= 30 )); then
    echo "FAIL: no self-test started within 30 s. Was $APP_BIN built with --features self-test?" >&2
    kill "$PID" 2>/dev/null || true
    exit 1
  fi
  PHASE=$(cat "$OUT/phase.txt" 2>/dev/null || echo startup)
  RSS=0
  FOOT=0
  for P in $(app_pids); do
    R=$(ps -o rss= -p "$P" 2>/dev/null | tr -d ' ' || true)
    RSS=$((RSS + ${R:-0}))
    if command -v footprint >/dev/null 2>&1; then
      F=$(footprint -p "$P" 2>/dev/null | awk '/Footprint:/ {v=$(NF-5); u=$(NF-4); if (u=="KB") v/=1024; else if (u=="GB") v*=1024; else if (u=="B") v/=1048576; printf "%d", v; exit}' || true)
      FOOT=$((FOOT + ${F:-0}))
    fi
  done
  printf '%s\t%d\t%d\n' "$PHASE" "$((RSS / 1024))" "$FOOT" >> "$SAMPLES"
  sleep 0.5
done

EXITED=""
for _ in $(seq 1 150); do
  if ! kill -0 "$PID" 2>/dev/null; then
    STATUS=0
    wait "$PID" || STATUS=$?
    EXITED="$STATUS"
    break
  fi
  sleep 0.1
done
if [[ -z "$EXITED" ]]; then
  echo "App did not quit by itself within 15 s; stopping it." >&2
  kill "$PID" || true
fi

if [[ ! -f "$OUT/report.json" ]]; then
  echo "FAIL: no report.json written" >&2
  exit 1
fi

python3 - "$OUT" "$SAMPLES" "$EXITED" <<'PY'
import json, struct, sys, pathlib
out = pathlib.Path(sys.argv[1])
exited = sys.argv[3]
report = json.loads((out / 'report.json').read_text())
print(json.dumps({k: report[k] for k in ('ok', 'totalMs', 'previewCacheBytes', 'userAgent')}, indent=2))
for s in report['steps']:
    print(f"  {'PASS' if s['ok'] else 'FAIL'}  {s['name']} ({s['ms']} ms) {s.get('detail') or ''}")
problems = [] if report['ok'] else ['a step failed']

# The quit right after the rename: held until the frontend saved, then the app ended by itself.
if exited != '0':
    problems.append(f'the app exited with status {exited}' if exited else 'the app did not quit by itself (no answer to wajha://before-exit)')
quit = report.get('quit')
if quit:
    project = out / 'data' / 'projects' / quit['projectId'] / 'project.json'
    saved = json.loads(project.read_text()).get('name') if project.exists() else None
    if saved == quit['name']:
        print(f"  PASS  quitting saved the rename made just before it ({saved!r})")
    else:
        problems.append(f"quitting lost the rename made just before it (on disk {saved!r}, expected {quit['name']!r})")
else:
    problems.append('the self-test did not reach the quit check')
for rel in report['files']:
    f = out / rel
    if not f.exists():
        problems.append(f'missing {rel}'); continue
    data = f.read_bytes()
    if rel.endswith('.png'):
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            problems.append(f'{rel}: not a PNG'); continue
        w, h, depth, color = struct.unpack('>IIBB', data[16:26])
        if color != 2:
            problems.append(f'{rel}: colour type {color}, expected 2 (RGB, no alpha)')
        print(f'  {rel}: {w}x{h} colour type {color}, {len(data)//1024} KB')

phases = {}
for line in pathlib.Path(sys.argv[2]).read_text().splitlines():
    name, rss, foot = line.split('\t')
    phases.setdefault(name, []).append((int(rss), int(foot)))
print('Memory, app + WebKit helpers (MB):')
print(f"  {'phase':<12} {'footprint':>18} {'rss':>16}")
for name in ('launch-idle', 'export', 'editor-idle', 'home-idle'):
    rows = phases.get(name)
    if not rows:
        continue
    # Idle phases: the settled value (median of the second half); others: the peak.
    if name.endswith('idle'):
        tail = sorted(rows[len(rows) // 2:])
        rss, foot = tail[len(tail) // 2]
        label = 'settled'
    else:
        rss, foot = max(r[0] for r in rows), max(r[1] for r in rows)
        label = 'peak'
    print(f"  {name:<12} {label:>7} {foot or '-':>10} {label:>7} {rss:>8}")
if problems:
    print('FAIL:', '; '.join(problems)); sys.exit(1)
print('PASS')
PY
