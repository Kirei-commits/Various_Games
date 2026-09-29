#!/usr/bin/env bash
# PreToolUse フック: WebFetch と、URL を含む Bash コマンドを、禁止リストのドメインなら止める。
# 禁止リスト: .claude/blocked-domains.txt（1行1ドメイン、サブドメインも対象、# はコメント）
set -u
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
case "$tool" in
  WebFetch) text=$(printf '%s' "$input" | jq -r '.tool_input.url // empty') ;;
  Bash)     text=$(printf '%s' "$input" | jq -r '.tool_input.command // empty') ;;
  *)        exit 0 ;;
esac
[ -n "$text" ] || exit 0

list="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/blocked-domains.txt"
[ -f "$list" ] || exit 0

# URL の中のホスト名を取り出す（http(s)://host[:port]/...）。見つからなければ何もしない
hosts=$(printf '%s' "$text" | grep -oiE 'https?://[^/[:space:]"'"'"'<>]+' | sed -E 's#^[a-zA-Z]+://##; s#^[^@]*@##; s#:[0-9]+$##' | tr 'A-Z' 'a-z' | sort -u)
[ -n "$hosts" ] || exit 0

while IFS= read -r raw; do
  d=$(printf '%s' "${raw%%#*}" | tr -d '[:space:]' | tr 'A-Z' 'a-z')
  [ -n "$d" ] || continue
  while IFS= read -r h; do
    if [ "$h" = "$d" ] || [ "${h%.$d}" != "$h" ]; then
      reason="$h は禁止リスト（.claude/blocked-domains.txt の $d）に入っているため、読みに行きません。"
      jq -n --arg r "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      exit 0
    fi
  done <<< "$hosts"
done < "$list"
exit 0
