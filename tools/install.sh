#!/usr/bin/env bash
# seed 一式を既存 repo へ copy-in する冪等 installer（PJ が育てた file だけ止めて問い直す）
# 契約の正は SEED-CONTRACT.md。使い方は --help
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
    $PROG [--overwrite] [--commit|--no-commit] [<target-repo-dir>]

Copies this seed's owned dirs into <target-repo-dir> and adds marker-delimited
blocks to CLAUDE.md / .gitignore. An existing .gitignore block is refreshed to
this seed's version; an existing CLAUDE.md block is left as the project has it.
The target may be relative, and defaults to the current directory.

Existing files that already match the seed are left alone, and ones still holding
an older seed version are refreshed in place. Files whose content this seed never
shipped belong to the project: updating an install that is already here keeps
them and lists them at the end, while a first install that runs into them writes
nothing at all, since that usually means the wrong target directory. --overwrite
replaces them in either case.

In a git repo the seed paths that are not committed yet are then offered for
commit -- one keypress on a terminal, where only y or Y proceeds and every other
key cancels; forced by --commit, suppressed by --no-commit. Cancelling leaves
the files on disk, and re-running reaches the same prompt without recopying.
EOF
}

die() {
  printf '%s: %s\n' "$PROG" "$1" >&2
  exit "${2:-64}"
}

# --git-common-dir は -C に渡した dir からの相対で返ることがある（git 2.43 で実測）
git_common_dir() {
  local out
  out=$(git -C "$1" rev-parse --git-common-dir 2>/dev/null) || return 1
  [[ $out == /* ]] || out=$1/$out
  realpath -e -- "$out" 2>/dev/null
}

# path が違っても同じ repo なら書き込み先は seed 自身 — worktree と 2 つ目の checkout がこれに当たる
target_is_seed_repo() {
  local seed_git target_git
  # .git を持たない copy から rev-parse すると、それを内包する側の repo を seed と誤認する
  seed_is_git_root || return 1
  seed_git=$(git_common_dir "$SEED_ROOT") || return 1
  target_git=$(git_common_dir "$1") || return 1
  [[ $seed_git == "$target_git" ]]
}

# 対象違いは残りの判定を全て無意味にするので、1 file も書かずに正しい呼び方だけ示す
refuse_seed_target() {
  local target=$1 reason=$2
  case $reason in
    self)
      printf '%s: refusing to install into the seed checkout itself (%s).\n\n' "$PROG" "$SEED_ROOT" >&2
      ;;
    inside)
      printf '%s: refusing to install into %s, which sits inside the seed checkout (%s).\n\n' \
        "$PROG" "$target" "$SEED_ROOT" >&2
      ;;
    repo)
      printf '%s: refusing to install into %s. The path differs from the seed (%s), but it is\n' \
        "$PROG" "$target" "$SEED_ROOT" >&2
      printf 'a checkout of the same git repository -- a worktree or a second checkout of the\n' >&2
      printf 'seed is still the seed, and installing there rewinds the files you are editing.\n\n' >&2
      ;;
  esac
  cat >&2 <<EOF
The seed is where an install copies from, never what it copies into -- aiming it
here would overwrite the very files being copied. Run it from the repo that is
meant to receive the seed:

  cd <your project repo>
  $SCRIPT_PATH

or name that repo instead of cd-ing into it:

  $SCRIPT_PATH <target-repo-dir>

Nothing was written. To change the seed itself, edit the files in this checkout
directly; there is nothing to install here. $PROG --help describes what an
install writes, and README.md here describes how the seed is meant to be adopted.
EOF
  exit 64
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

# working tree の mode が落ちていても、seed が記録した exec bit で配る（hook が黙って無効化されるのを防ぐ）
list_seed_exec_files() {
  local entry dir head2
  if seed_is_git_root; then
    while IFS= read -r -d '' entry; do
      if [[ ${entry%% *} == 100755 ]]; then
        printf '%s\0' "${entry#*$'\t'}"
      fi
    done < <(git -C "$SEED_ROOT" -c core.quotePath=false ls-files -s -z -- "$@")
    return 0
  fi
  # zip 展開等の copy には記録された mode が無い。shebang を持つ file を実行対象とみなす
  printf '%s: the seed is not a git checkout, so exec bits are inferred from shebangs.\n' "$PROG" >&2
  for dir in "$@"; do
    while IFS= read -r -d '' entry; do
      read -r -n 2 head2 < "$SEED_ROOT/$entry" || head2=""
      if [[ $head2 == '#!' ]]; then
        printf '%s\0' "$entry"
      fi
    done < <(list_seed_files "$dir")
  done
}

list_seed_files() {
  local dir=$1
  if seed_is_git_root; then
    git -C "$SEED_ROOT" -c core.quotePath=false ls-files -z -- "$dir"
  else
    (cd -- "$SEED_ROOT" && find "$dir" -type f \
      -not -path '*/node_modules/*' -not -path 'pp/artifacts/*' -not -path '*/dist/*' \
      -not -path '*/.cc-writes/*' -not -name 'settings.local.json' \
      \( -not -path 'pp/vendor/*' -o -path 'pp/vendor/README.md' -o -path 'pp/vendor/routes.json' \) -print0)
  fi
}

extract_marker_block() {
  awk -v b="$2" -v e="$3" '$0 == b { in_block = 1 } in_block { print } $0 == e { in_block = 0 }' "$1"
}

# 区間だけを差し替える。位置を動かすと .gitignore の否定パターンの効き方が変わる
replace_marker_block() {
  local target_file=$1 begin=$2 end=$3 block=$4 updated
  updated=$(awk -v b="$begin" -v e="$end" -v block="$block" '
    $0 == b { skip = 1; print block; next }
    skip && $0 == e { skip = 0; next }
    !skip { print }
  ' "$target_file")
  printf '%s\n' "$updated" > "$target_file"
}

# seed 側 file の marker 区間を target へ配る。mode=refresh なら既存区間を現行版へ入れ替える
sync_marker_block() {
  local source_file=$1 target_file=$2 begin=$3 end=$4 mode=$5 block
  block=$(extract_marker_block "$source_file" "$begin" "$end")
  [[ -n $block ]] || die "marker block not found in seed file: $source_file" 70
  if [[ -f $target_file ]] && grep -qF -- "$begin" "$target_file"; then
    if [[ $mode != refresh ]]; then
      printf 'skip (marker present): %s\n' "$(basename "$target_file")"
    elif [[ $(extract_marker_block "$target_file" "$begin" "$end") == "$block" ]]; then
      printf 'up to date: %s\n' "$(basename "$target_file")"
    else
      replace_marker_block "$target_file" "$begin" "$end" "$block"
      printf 'refresh (fe-starter block): %s\n' "$(basename "$target_file")"
    fi
    return
  fi
  if [[ -s $target_file ]]; then
    printf '\n%s\n' "$block" >> "$target_file"
  else
    printf '%s\n' "$block" > "$target_file"
  fi
  printf 'append: %s\n' "$(basename "$target_file")"
}

# 配った道具の呼び口が据え置き file の中にあると起動できない。黙っていると気づけないので知らせる。
# 走査するのは配った集合だけ — file system を見ると、配っていない未追跡 file まで数えてしまう
warn_unreachable_tools() {
  local target=$1 manifest=$2 shipped=$3
  shift 3
  local -a kept=("$@") unreachable=()
  local pkg dir rel
  for pkg in "${kept[@]}"; do
    [[ $pkg == "$manifest" || $pkg == */$manifest ]] || continue
    dir=${pkg%"$manifest"}
    while IFS= read -r rel; do
      [[ $rel == "$dir"scripts/* ]] || continue
      grep -qF -- "${rel##*/}" "$target/$pkg" || unreachable+=("$rel")
    done <<< "$shipped"
  done
  ((${#unreachable[@]} > 0)) || return 0
  printf '\n%s: %d tool(s) have no entry in %s, which this project owns:\n' \
    "$PROG" "${#unreachable[@]}" "$manifest" >&2
  print_paths "${unreachable[@]}"
  printf 'Add an entry to run them, or leave it as is if this project uses its own.\n' >&2
}

print_paths() {
  local shown=0 rel
  for rel in "$@"; do
    if ((shown >= 20)); then
      printf '  ... and %d more\n' "$(($# - shown))" >&2
      return
    fi
    printf '  %s\n' "$rel" >&2
    shown=$((shown + 1))
  done
}

# git が版を持っている file だけが上書き後に戻せる。untracked と未 commit の変更は消えたら終わり
list_unrecoverable() {
  local target=$1 entry
  shift
  command -v git >/dev/null 2>&1 || { printf '%s\0' "$@"; return; }
  if ! git -C "$target" rev-parse --git-dir >/dev/null 2>&1; then
    printf '%s\0' "$@"
    return
  fi
  # porcelain -z の 1 entry は "XY <path>"。status に現れる = untracked か未 commit の変更あり
  while IFS= read -r -d '' entry; do
    printf '%s\0' "${entry:3}"
  done < <(git -C "$target" status --porcelain -z -- "$@")
}

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
report_collisions() {
  local target=$1 count=$2
  shift 2
  printf '%s: stopping before writing anything — %d file(s) hold content this seed never shipped.\n\n' "$PROG" "$count" >&2
  print_paths "${@:1:$count}"
  cat >&2 <<EOF

Nothing was copied. Files still carrying an older seed version are refreshed
without asking, so what is listed above was changed here: pp/src/config.ts
(viewports, locale, pinned clock), pp/src/selector-map.ts (MANUAL_PAIRS),
.claude/settings.json (hook registrations belonging to other tools), and anything
else adapted for this project.
EOF
  if (($# > count)); then
    printf '\ngit cannot restore %d of them after --overwrite. They are untracked, or they\n' "$(($# - count))" >&2
    printf 'carry uncommitted changes, so no copy exists to go back to:\n\n' >&2
    print_paths "${@:count+1}"
    cat >&2 <<'EOF'

Commit or stash those first. Once git holds them, --overwrite costs a git restore
to undo instead of being final.
EOF
  else
    printf '\nAll of them are tracked and clean here, so --overwrite is undoable with\n' >&2
    printf 'git restore.\n' >&2
  fi
  cat >&2 <<EOF

To replace them with the seed's versions, re-run with --overwrite:

  $PROG --overwrite $target

To pick up newer seed changes without losing local edits, leave this script out
of it and move them through git, where the merge stays reviewable:

  git remote add seed <seed repo url>
  git fetch seed && git cherry-pick <commit>
EOF
}

is_git_repo() {
  command -v git >/dev/null 2>&1 && git -C "$1" rev-parse --git-dir >/dev/null 2>&1
}

# seed 由来の痕跡があれば初回導入でなく更新。marker も見るのは、配布 file を全部差し替えた repo でも更新と判る形にするため
seed_already_installed() {
  local target=$1 recognised=$2
  ((recognised == 0)) || return 0
  [[ ! -f $target/CLAUDE.md ]] || ! grep -qF -- "$CLAUDE_BEGIN" "$target/CLAUDE.md" || return 0
  [[ ! -f $target/.gitignore ]] || ! grep -qF -- "$GITIGNORE_BEGIN" "$target/.gitignore" || return 0
  return 1
}

# 過去に seed が配った版と同じ中身なら PJ の編集は乗っていない — 黙って新版へ入れ替えてよい
is_former_seed_version() {
  local rel=$1 file=$2 blob rev
  seed_is_git_root || return 1
  blob=$(git -C "$SEED_ROOT" hash-object -- "$file") || return 1
  while read -r rev; do
    [[ $(git -C "$SEED_ROOT" rev-parse -q --verify "$rev:$rel") != "$blob" ]] || return 0
  done < <(git -C "$SEED_ROOT" log --all --format=%H -- "$rel")
  return 1
}

strip_marker_block() {
  # 末尾の空行も落とす — 追記が 1 行入れるため、残すと HEAD 側と一致しなくなる
  awk -v b="$2" -v e="$3" '
    $0 == b { skip = 1 }
    !skip { buf[n++] = $0 }
    $0 == e { skip = 0; next }
    END { while (n > 0 && buf[n - 1] == "") n--; for (i = 0; i < n; i++) print buf[i] }
  ' "$1"
}

# marker 区間を除いてなお HEAD と差があるなら、それは他人の未 commit 編集
marker_has_foreign_edit() {
  local target=$1 file=$2 begin=$3 end=$4
  git -C "$target" cat-file -e "HEAD:$file" 2>/dev/null || return 1
  ! cmp -s <(strip_marker_block <(git -C "$target" show "HEAD:$file") "$begin" "$end") \
           <(strip_marker_block "$target/$file" "$begin" "$end")
}

confirm_commit() {
  local count=$1 reply
  if [[ ! -t 0 || ! -t 2 ]]; then
    printf '%s: no terminal to ask on, so the %d path(s) stay uncommitted. Re-run with --commit.\n' "$PROG" "$count" >&2
    return 1
  fi
  printf '%s: commit the %d seed path(s) not yet committed here? [y/N] ' "$PROG" "$count" >&2
  read -rsn1 reply || reply=""
  printf '\n' >&2
  # 矢印等の残りを読み捨てる。timeout で抜けるのが正常なので status は見ない
  [[ $reply != $'\e' ]] || read -rsn8 -t 0.05 _ || :
  [[ $reply == [Yy] ]]
}

commit_installed() {
  local target=$1 mode=$2 entry
  shift 2
  local -a pending=()
  if ! is_git_repo "$target"; then
    printf '%s: the target is not a git repo, so nothing was committed.\n' "$PROG"
    return
  fi
  # status 経由で拾うことで、ignore された path を git add に渡して失敗させずに済む
  while IFS= read -r -d '' entry; do
    pending+=("${entry:3}")
  done < <(git -C "$target" status --porcelain -z --untracked-files=all -- "$@")
  if ((${#pending[@]} == 0)); then
    printf '%s: the seed paths are already committed here.\n' "$PROG"
    return
  fi
  if [[ $mode == no ]] || { [[ $mode != yes ]] && ! confirm_commit "${#pending[@]}"; }; then
    printf '%s: left %d path(s) uncommitted. Re-running reaches this prompt again.\n' "$PROG" "${#pending[@]}" >&2
    return
  fi
  git -C "$target" add -- "${pending[@]}" || die "git add failed in $target" 70
  # add 後に差分が消えるのは異常ではない（index から外れていた path を書き戻した等）。commit の失敗と混ぜない
  if git -C "$target" diff --cached --quiet -- "${pending[@]}"; then
    printf '%s: the seed paths are already committed here.\n' "$PROG"
    return
  fi
  git -C "$target" commit -q -m "Install $(basename "$SEED_ROOT")" -- "${pending[@]}" \
    || die "git commit failed in $target (is user.name/user.email set?)" 70
  printf '%s: committed %d path(s).\n' "$PROG" "${#pending[@]}"
}

main() {
  local target="" overwrite=0 commit_mode=ask
  while (($#)); do
    case $1 in
      -h|--help) usage; exit 0 ;;
      --overwrite) overwrite=1 ;;
      --commit) commit_mode=yes ;;
      --no-commit) commit_mode=no ;;
      -*) die "unknown option: $1" ;;
      *)
        [[ -z $target ]] || die "unexpected argument: $1"
        target=$1
        ;;
    esac
    shift
  done
  [[ -n $target ]] || target=$PWD
  [[ -d $target ]] || die "target directory not found: $target" 66
  target=$(cd -- "$target" && pwd -P)
  # 配布元へ配ると自分を上書きする。subdir も、path の違う同一 repo も、行き先は同じ seed
  if [[ $target == "$SEED_ROOT" ]]; then
    refuse_seed_target "$target" self
  elif [[ $target == "$SEED_ROOT"/* ]]; then
    refuse_seed_target "$target" inside
  elif target_is_seed_repo "$target"; then
    refuse_seed_target "$target" repo
  fi

  local dir rel src dst
  local -a rels=() collisions=()
  # seed 由来と分かる file を衝突に数えないための 2 分類 — でないと再実行が必ず止まる
  local -A identical=() stale=() foreign=()
  for dir in "${COPY_DIRS[@]}"; do
    while IFS= read -r -d '' rel; do
      [[ -n $rel ]] || continue
      rels+=("$rel")
      [[ -e $target/$rel ]] || continue
      if cmp -s -- "$SEED_ROOT/$rel" "$target/$rel"; then
        identical[$rel]=1
      elif is_former_seed_version "$rel" "$target/$rel"; then
        stale[$rel]=1
      else
        collisions+=("$rel")
        foreign[$rel]=1
      fi
    done < <(list_seed_files "$dir")
  done
  # 1 件も見つからないのは列挙の失敗（不完全な seed コピー等）— 半端な marker だけ残して成功と偽らない
  ((${#rels[@]} > 0)) || die "no seed files found under $SEED_ROOT — incomplete seed copy?" 70

  local -a unrecoverable=()
  if ((${#collisions[@]} > 0)); then
    while IFS= read -r -d '' rel; do
      unrecoverable+=("$rel")
    done < <(list_unrecoverable "$target" "${collisions[@]}")
  fi

  # 既に seed が入っている repo なら更新であり、PJ が育てた file を避けて残りは配る。
  # 初回で衝突するのは対象 dir 違いを疑う場面なので、そちらは 1 file も書かずに止める
  local keep_foreign=0
  if ((${#collisions[@]} > 0)) && ((overwrite == 0)); then
    if seed_already_installed "$target" "$((${#identical[@]} + ${#stale[@]}))"; then
      keep_foreign=1
    else
      report_collisions "$target" "${#collisions[@]}" "${collisions[@]}" ${unrecoverable[@]+"${unrecoverable[@]}"}
      exit 65
    fi
  fi

  if ((${#unrecoverable[@]} > 0)) && ((keep_foreign == 0)); then
    printf '%s: overwriting %d file(s) that git cannot restore afterwards:\n' "$PROG" "${#unrecoverable[@]}" >&2
    print_paths "${unrecoverable[@]}"
    printf '\n' >&2
  fi

  local -a marker_files=(CLAUDE.md .gitignore .worktreeinclude)
  local -A dirty_marker=()
  if is_git_repo "$target"; then
    if marker_has_foreign_edit "$target" CLAUDE.md "$CLAUDE_BEGIN" "$CLAUDE_END"; then
      dirty_marker[CLAUDE.md]=1
    fi
    if marker_has_foreign_edit "$target" .gitignore "$GITIGNORE_BEGIN" "$GITIGNORE_END"; then
      dirty_marker[.gitignore]=1
    fi
    if marker_has_foreign_edit "$target" .worktreeinclude "$GITIGNORE_BEGIN" "$GITIGNORE_END"; then
      dirty_marker[.worktreeinclude]=1
    fi
  fi

  local -A exec_bit=()
  while IFS= read -r -d '' rel; do
    exec_bit[$rel]=1
  done < <(list_seed_exec_files "${COPY_DIRS[@]}")

  local created=0 replaced=0 refreshed=0
  for rel in "${rels[@]}"; do
    [[ -v identical[$rel] ]] && continue
    if ((keep_foreign)) && [[ -v foreign[$rel] ]]; then
      continue
    fi
    src=$SEED_ROOT/$rel
    dst=$target/$rel
    if [[ ! -e $dst ]]; then
      created=$((created + 1))
    elif [[ -v stale[$rel] ]]; then
      refreshed=$((refreshed + 1))
    else
      replaced=$((replaced + 1))
    fi
    mkdir -p -- "$(dirname "$dst")"
    # -p で mode を保存する（design_sync / hook script の exec bit を落とさない）
    cp -p -- "$src" "$dst"
    if [[ -v exec_bit[$rel] ]]; then
      chmod +x -- "$dst"
    fi
  done

  # .gitignore は機械的に効くので追随させ、強制力を持たない CLAUDE.md は PJ のものに任せる
  sync_marker_block "$SEED_ROOT/CLAUDE.md" "$target/CLAUDE.md" "$CLAUDE_BEGIN" "$CLAUDE_END" keep
  sync_marker_block "$SEED_ROOT/.gitignore" "$target/.gitignore" "$GITIGNORE_BEGIN" "$GITIGNORE_END" refresh
  # 同じ marker 書式。worktree へ何を持ち込むかは、何を gitignore するかを決めた側が決める
  sync_marker_block "$SEED_ROOT/.worktreeinclude" "$target/.worktreeinclude" "$GITIGNORE_BEGIN" "$GITIGNORE_END" refresh

  printf '\n%s: %d copied, %d refreshed from an older seed version, %d overwritten, %d already current, %d left to the project\n' \
    "$PROG" "$created" "$refreshed" "$replaced" "${#identical[@]}" "$((keep_foreign ? ${#collisions[@]} : 0))"
  printf 'NOTE: the seed README.md / SEED-CONTRACT.md are not copied (the project owns those paths); read them in the seed checkout.\n'
  if ((keep_foreign)); then
    # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
    printf '\n%s: %d file(s) were left as this project has them, so any seed change to them did not land:\n' "$PROG" "${#collisions[@]}" >&2
    print_paths "${collisions[@]}"
    cat >&2 <<EOF

These are the paths a project is expected to grow into (pp/src/config.ts,
frontend/src/app.html, the docs it fills in), so replacing them would undo the
day-0 work. Everything else was updated.

If a seed change to one of them matters, merge it by hand, or re-run with
--overwrite and pick your edits back out of git.
EOF
  fi
  if ((keep_foreign)); then
    warn_unreachable_tools "$target" package.json "$(printf '%s\n' "${rels[@]}")" "${collisions[@]}"
  fi
  if ((replaced > 0)); then
    printf 'overwritten:\n' >&2
    printf '  %s\n' "${collisions[@]}" >&2
    printf 'Review these with git diff before committing — local adaptations in them are gone.\n' >&2
  fi

  # PJ の版を残した path は install が書いていない。混ぜると PJ の未 commit 作業を install の名前で commit する
  local -a commit_paths=()
  for rel in "${rels[@]}"; do
    if ((keep_foreign)) && [[ -v foreign[$rel] ]]; then
      continue
    fi
    commit_paths+=("$rel")
  done
  for rel in "${marker_files[@]}"; do
    [[ -v dirty_marker[$rel] ]] || commit_paths+=("$rel")
  done
  if ((${#dirty_marker[@]} > 0)); then
    printf '%s: left out of the commit because it already had uncommitted edits: %s\n' \
      "$PROG" "${!dirty_marker[*]}" >&2
  fi
  printf '\n'
  commit_installed "$target" "$commit_mode" "${commit_paths[@]}"
}

main "$@"
