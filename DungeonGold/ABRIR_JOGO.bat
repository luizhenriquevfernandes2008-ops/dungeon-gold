@echo off
title Dungeon Gold
cd /d "%~dp0"

echo.
echo   ============================
echo      D U N G E O N   G O L D
echo   ============================
echo.
echo   Subindo servidor local na porta 8123...
echo   Deixe esta janela ABERTA enquanto joga.
echo   Para fechar o jogo: feche esta janela.
echo.

REM servidor.py manda cabecalho anti-cache. Sem ele o navegador insiste
REM na versao antiga do CSS e do JavaScript depois de uma atualizacao,
REM e o jogo abre com a tela quebrada.

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8123/index.html
  if exist "servidor.py" ( py servidor.py 8123 ) else ( py -m http.server 8123 )
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8123/index.html
  if exist "servidor.py" ( python servidor.py 8123 ) else ( python -m http.server 8123 )
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8123/index.html
  npx --yes serve -l 8123 --no-clipboard .
  goto :eof
)

echo   Nao encontrei Python nem Node.js instalado.
echo.
echo   O jogo usa modulos JavaScript, que os navegadores
echo   bloqueiam quando o arquivo e aberto direto (file://).
echo   Por isso ele precisa de um servidor local.
echo.
echo   Instale o Python em https://python.org/downloads
echo   (marque "Add Python to PATH") e rode este arquivo de novo.
echo.
pause
