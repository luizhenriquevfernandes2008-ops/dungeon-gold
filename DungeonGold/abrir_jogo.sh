#!/usr/bin/env bash
# Dungeon Gold — sobe um servidor local e abre o jogo no navegador.
cd "$(dirname "$0")" || exit 1
PORTA=8123
URL="http://localhost:$PORTA/index.html"

echo "  D U N G E O N   G O L D"
echo "  servidor local em $URL"
echo "  deixe este terminal aberto enquanto joga (Ctrl+C para sair)"
echo

( sleep 1
  if command -v open >/dev/null;  then open "$URL"
  elif command -v xdg-open >/dev/null; then xdg-open "$URL"
  fi ) &

# servidor.py manda cabecalho anti-cache: sem ele o navegador insiste
# na versao antiga do CSS e do JS depois de uma atualizacao.
if command -v python3 >/dev/null; then
  if [ -f servidor.py ]; then python3 servidor.py "$PORTA"; else python3 -m http.server "$PORTA"; fi
elif command -v python >/dev/null; then
  if [ -f servidor.py ]; then python servidor.py "$PORTA"; else python -m http.server "$PORTA"; fi
elif command -v node >/dev/null; then
  npx --yes serve -l "$PORTA" .
else
  echo "Nao encontrei Python nem Node.js. Instale um dos dois e rode de novo."
  exit 1
fi
