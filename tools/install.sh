#!/usr/bin/env bash
# claude-design-fe-starter を既存 repo へ copy-in する冪等 installer（追加のみ・既存ファイルは変更しない）
# 契約の正は SEED-CONTRACT.md。使い方: git clone --depth 1 <seed> /tmp/fe-seed && /tmp/fe-seed/tools/install.sh <target>
set -euo pipefail

PROG=$(basename "$0")
SCRIPT_PATH=$(realpath -e "$0")
SEED_ROOT=$(dirname "$(dirname "$SCRIPT_PATH")")
readonly PROG SCRIPT_PATH SEED_ROOT

COPY_DIRS=(frontend pp design-reference docs seed-docs tools .claude)
CLAUDE_BEGIN='<!-- fe-starter:begin -->'
CLAUDE_END='<!-- fe-starter:end -->'
GITIGNORE_BEGIN='# fe-starter:begin'
GITIGNORE_END='# fe-starter:end'

usage() {
  cat <<EOF
Usage:
    $PROG {-h|--help}
    $PROG <target-repo-dir>

Copies this seed's owned dirs into <target-repo-dir> (add-only), and appends
marker-delimited blocks to CLAUDE.md / .gitignore (skipped when already present).
Re-running is safe: existing files are never overwritten.
EOF
}

die() {
  printf '%s: %s\n' "$PROG" "$1" >&2
  exit "${2:-64}"
}

# seed の追跡ファイルだけを対象にする（node_modules 等の混入防止）。.git の無いコピーでは find で代替
list_seed_files() {
  local dir=$1
  if command -v git >/dev/null 2>&1 && git -C "$SEED_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$SEED_ROOT" ls-files -- "$dir"
  else
    (cd -- "$SEED_ROOT" && find "$dir" -type f -not -path '*/node_modules/*' -not -path 'pp/artifacts/*')
  fi
}

# seed 側 file の marker 区間を target へ追記する。marker が既にあれば何もしない（冪等）
append_marker_block() {
  local source_file=$1 target_file=$2 begin=$3 end=$4
  if [[ -f $target_file ]] && grep -qF -- "$begin" "$target_file"; then
    printf 'skip (marker present): %s\n' "$(basename "$target_file")"
    return
  fi
  local block
  block=$(awk -v b="$begin" -v e="$end" '$0 == b { in_block = 1 } in_block { print } $0 == e { in_block = 0 }' "$source_file")
  [[ -n $block ]] || die "marker block not found in seed file: $source_file" 70
  if [[ -s $target_file ]]; then
    printf '\n%s\n' "$block" >> "$target_file"
  else
    printf '%s\n' "$block" > "$target_file"
  fi
  printf 'append: %s\n' "$(basename "$target_file")"
}

main() {
  [[ $# -eq 1 ]] || { usage >&2; exit 64; }
  case $1 in
    -h|--help) usage; exit 0 ;;
  esac
  local target=$1
  [[ -d $target ]] || die "target directory not found: $target" 66
  target=$(cd -- "$target" && pwd -P)
  [[ $target != "$SEED_ROOT" ]] || die "target is the seed checkout itself"

  local created=0 skipped=0
  local skipped_files=()
  local dir rel src dst
  for dir in "${COPY_DIRS[@]}"; do
    while IFS= read -r rel; do
      [[ -n $rel ]] || continue
      src=$SEED_ROOT/$rel
      dst=$target/$rel
      if [[ -e $dst ]]; then
        skipped=$((skipped + 1))
        skipped_files+=("$rel")
        continue
      fi
      mkdir -p -- "$(dirname "$dst")"
      # -p で mode を保存する（design_sync / hook script の exec bit を落とさない）
      cp -p -- "$src" "$dst"
      created=$((created + 1))
    done < <(list_seed_files "$dir")
  done

  append_marker_block "$SEED_ROOT/CLAUDE.md" "$target/CLAUDE.md" "$CLAUDE_BEGIN" "$CLAUDE_END"
  append_marker_block "$SEED_ROOT/.gitignore" "$target/.gitignore" "$GITIGNORE_BEGIN" "$GITIGNORE_END"

  printf '\n%s: %d file(s) copied, %d existing file(s) left untouched\n' "$PROG" "$created" "$skipped"
  if ((skipped > 0)); then
    printf '  untouched: %s\n' "${skipped_files[@]}"
    case " ${skipped_files[*]} " in
      *' .claude/settings.json '*)
        printf 'NOTE: .claude/settings.json が既存のため、hooks 登録は seed の同 file から手動 merge してください\n'
        ;;
    esac
  fi
}

main "$@"
