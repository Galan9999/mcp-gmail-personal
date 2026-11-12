#!/usr/bin/env bash
# Hook PreToolUse de Claude Code para mcp__gmail-personal__send_email.
# Deniega el envio en los modos en que una persona podria no ver el prompt de permiso.
# Es la capa CLIENTE, determinista: no depende de que el servidor declare requiresUserInteraction
# ni de que la version de Claude Code la respete.
#
# Instalacion (una vez), en ~/.claude/settings.json:
#   "hooks": { "PreToolUse": [ { "matcher": "mcp__gmail-personal__send_email",
#     "hooks": [ { "type": "command", "command": "bash /ruta/al/repo/hooks/guard-send-email.sh", "timeout": 10 } ] } ] }
#
# Necesita jq. Si falta, falla CERRADO: deniega en vez de dejar pasar.

deny() {
  # El motivo se escribe con printf para no depender de jq aqui. No lleva comillas ni saltos de linea.
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
}

input=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  deny "send_email bloqueado: el hook guard-send-email.sh necesita jq para leer el modo de permisos y no esta instalado (brew install jq). Mientras tanto, deja un create_draft."
  exit 0
fi

mode=$(printf '%s' "$input" | jq -r '.permission_mode // "unknown"')
case "$mode" in
  bypassPermissions|dontAsk)
    deny "send_email bloqueado en modo $mode: enviar correo exige que una persona vea el prompt. Deja un create_draft o cambia de modo de permisos."
    ;;
  *) exit 0 ;;
esac
