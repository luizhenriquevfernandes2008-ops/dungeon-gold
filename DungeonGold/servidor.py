# Servidor local do Dungeon Gold.
#
# Igual ao `python -m http.server`, com UMA diferenca que importa:
# manda Cache-Control: no-store. Sem isso o navegador guarda o CSS e
# os modulos JavaScript e continua mostrando a versao antiga depois de
# uma atualizacao — a tela abre quebrada e nao ha o que clicar.
#
# Chamado por ABRIR_JOGO.bat e abrir_jogo.sh. Se este arquivo sumir,
# os lancadores caem no `python -m http.server` normal.

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SemCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print('Dungeon Gold rodando em http://localhost:%d/index.html' % porta)
    print('Deixe esta janela aberta enquanto joga. Ctrl+C encerra.')
    try:
        ThreadingHTTPServer(('127.0.0.1', porta), SemCache).serve_forever()
    except KeyboardInterrupt:
        print('\nEncerrado.')
