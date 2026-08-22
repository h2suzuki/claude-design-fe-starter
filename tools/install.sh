#!/usr/bin/env bash
# claude-design-fe-starter を既存 repo へ copy-in する冪等 installer（追加のみ・既存ファイルは変更しない）
# 契約の正は SEED-CONTRACT.md。使い方: git clone --depth 1 <seed> /tmp/fe-seed && /tmp/fe-seed/tools/install.sh <target>
set -euo pipefail

PROG=$(basename "$0")
SCRIPT_PATH=$(realpath -e "$0")
SEED_ROOT=$(dirname "$(dirname "$SCRIPT_PATH")")
readonly PROG SCRIPT_PATH SEED_ROOT

COPY_DIRS=(frontend pp docs seed-docs tools .claude)
CLAUDE_BEGIN='<!-- fe-starter:begin -->'
CLAUDE_END='<!-- fe-starter:end -->'
GITIGNORE_BEGIN='# fe-starter:begin'
GITIGNORE_END='# fe-starter:end'

usage() {
  cat <<EOF
Usage:
    $PROG {-h|--help}
    $PROG [--overwrite] <target-repo-dir>

Copies this seed's owned dirs into <target-repo-dir> and appends marker-delimited
blocks to CLAUDE.md / .gitignore (skipped when the marker is already present).

Files that already exist in the target are never replaced silently. When any are
found, this script writes nothing and lists them; pass --overwrite to replace
them with the seed's versions. With no collisions, no option is needed.
EOF
}

die() {
  printf '%s: %s\n' "$PROG" "$1" >&2
  exit "${2:-64}"
}

# seed の追跡ファイルだけを NUL 区切りで列挙する（node_modules 等の混入防止・非 ASCII 名安全）。
# .git の無いコピーでは find で代替。親 repo の中に置かれた .git 無しコピーを git 経路と誤認しないよう、
# rev-parse の toplevel が SEED_ROOT 自身であることまで確認する
seed_is_git_root() {
  command -v git >/dev/null 2>&1 || return 1
  local toplevel
  toplevel=$(git -C "$SEED_ROOT" rev-parse --show-toplevel 2>/dev/null) || return 1
  [[ $toplevel == "$SEED_ROOT" ]]
}

list_seed_files() {
  local dir=$1
  if seed_is_git_root; then
    git -C "$SEED_ROOT" -c core.quotePath=false ls-files -z -- "$dir"
  else
    (cd -- "$SEED_ROOT" && find "$dir" -type f \
      -not -path '*/node_modules/*' -not -path 'pp/artifacts/*' -not -path '*/dist/*' \
      -not -path '*/.cc-writes/*' -not -name 'settings.local.json' \
      \( -not -path 'pp/vendor/*' -o -path 'pp/vendor/README.md' \) -print0)
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

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
report_collisions() {
  local target=$1 shown=0 rel
  shift
  printf '%s: stopping before writing anything — %d file(s) already exist in the target.\n\n' "$PROG" "$#" >&2
  for rel in "$@"; do
    if ((shown >= 20)); then
      printf '  ... and %d more\n' "$(($# - shown))" >&2
      break
    fi
    printf '  %s\n' "$rel" >&2
    shown=$((shown + 1))
  done
  cat >&2 <<EOF

Nothing was copied. The seed does not replace existing files by default, because
these paths often hold state the project owns: pp/src/config.ts (viewports,
locale, pinned clock), pp/src/selector-map.ts (MANUAL_PAIRS), .claude/settings.json
(hook registrations belonging to other tools), and anything already adapted here.

To replace them with the seed's versions, re-run with --overwrite:

  $PROG --overwrite $target

To pick up newer seed changes without losing local edits, leave this script out
of it and move them through git, where the merge stays reviewable:

  git remote add seed <seed repo url>
  git fetch seed && git cherry-pick <commit>
EOF
}

main() {
  local target="" overwrite=0
  while (($#)); do
    case $1 in
      -h|--help) usage; exit 0 ;;
      --overwrite) overwrite=1 ;;
      -*) die "unknown option: $1" ;;
      *)
        [[ -z $target ]] || die "unexpected argument: $1"
        target=$1
        ;;
    esac
    shift
  done
  [[ -n $target ]] || { usage >&2; exit 64; }
  [[ -d $target ]] || die "target directory not found: $target" 66
  target=$(cd -- "$target" && pwd -P)
  [[ $target != "$SEED_ROOT" ]] || die "target is the seed checkout itself"

  local dir rel src dst
  local -a rels=() collisions=()
  for dir in "${COPY_DIRS[@]}"; do
    while IFS= read -r -d '' rel; do
      [[ -n $rel ]] || continue
      rels+=("$rel")
      if [[ -e $target/$rel ]]; then
        collisions+=("$rel")
      fi
    done < <(list_seed_files "$dir")
  done
  # 1 件も見つからないのは列挙の失敗（不完全な seed コピー等）— 半端な marker だけ残して成功と偽らない
  ((${#rels[@]} > 0)) || die "no seed files found under $SEED_ROOT — incomplete seed copy?" 70

  # 衝突が 1 件でもあれば 1 file も書かずに止める。部分適用したうえで問い直すと、状態が説明できなくなる
  if ((${#collisions[@]} > 0)) && ((overwrite == 0)); then
    report_collisions "$target" "${collisions[@]}"
    exit 65
  fi

  local created=0 replaced=0
  for rel in "${rels[@]}"; do
    src=$SEED_ROOT/$rel
    dst=$target/$rel
    if [[ -e $dst ]]; then
      replaced=$((replaced + 1))
    else
      created=$((created + 1))
    fi
    mkdir -p -- "$(dirname "$dst")"
    # -p で mode を保存する（design_sync / hook script の exec bit を落とさない）
    cp -p -- "$src" "$dst"
  done

  append_marker_block "$SEED_ROOT/CLAUDE.md" "$target/CLAUDE.md" "$CLAUDE_BEGIN" "$CLAUDE_END"
  append_marker_block "$SEED_ROOT/.gitignore" "$target/.gitignore" "$GITIGNORE_BEGIN" "$GITIGNORE_END"

  printf '\n%s: %d file(s) copied, %d file(s) overwritten\n' "$PROG" "$created" "$replaced"
  printf 'NOTE: the seed README.md / SEED-CONTRACT.md are not copied (the project owns those paths); read them in the seed checkout.\n'
  if ((replaced > 0)); then
    printf 'overwritten:\n' >&2
    printf '  %s\n' "${collisions[@]}" >&2
    printf 'Review these with git diff before committing — local adaptations in them are gone.\n' >&2
  fi
}

main "$@"
