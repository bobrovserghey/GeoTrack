#!/usr/bin/env bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')
out=$(echo "$input" | jq -r '.tool_response.output // ""')

if echo "$cmd" | grep -qE 'gh pr create' && echo "$out" | grep -qE 'github\.com/.*/pull/[0-9]+'; then
  cat <<'EOF'
{
  "additionalContext": "PR создан. Спроси у пользователя: «Запустить проверку кода агентом orchestrator? (да/нет)». Не запускай проверку без явного согласия. При ответе «да» — делегируй субагенту orchestrator анализ диффа этого PR."
}
EOF
fi
