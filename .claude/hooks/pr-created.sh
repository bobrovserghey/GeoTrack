#!/usr/bin/env bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

if echo "$cmd" | grep -qE 'gh pr create'; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "PR создан. Спроси у пользователя: «Запустить проверку кода агентом orchestrator? (да/нет)». Не запускай проверку без явного согласия. При ответе «да» — делегируй субагенту orchestrator анализ диффа этого PR."
  }
}
EOF
fi