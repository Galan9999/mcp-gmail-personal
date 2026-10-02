#!/usr/bin/env bash
# Hook PreToolUse de Claude Code para mcp__gmail-personal__send_email.
# Deniega el envio en los modos en que ninguna persona veria el prompt de permiso.
# Es la capa CLIENTE, determinista: no depende de que el servidor declare requiresUserInteraction.
#
# Instalacion (una vez), en ~/.claude/settings.json:
#   "hooks": { "PreToolUse": [ { "matcher": "mcp__gmail-personal__send_email",
#     "hooks": [ { "type": "command", "command": "bash /ruta/al/repo/hooks/guard-send-email.sh", "timeout": 10 } ] } ] }
input=$(cat)
mode=$(printf '%s' "$input" | jq -r '.permission_mode // "unknown"')
case "$mode" in
  bypassPermissions|dontAsk)
    jq -n --arg m "$mode" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("send_email bloqueado en modo " + $m + ": enviar correo exige que una persona vea el prompt. Deja un create_draft o cambia de modo de permisos.")
      }
    }'
    ;;
  *) exit 0 ;;
esac
