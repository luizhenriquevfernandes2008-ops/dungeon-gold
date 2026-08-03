# Dungeon Gold

Roguelike em primeira pessoa que roda no navegador. 10 andares, cenários que
mudam de ordem a cada run, e um chefe final montado peça por peça na hora —
com nome e trilha próprios. Sem pasta de imagens nem de áudio: **todas** as
texturas, sprites, a fonte da interface e os sons são gerados por código em
tempo de execução.

## Como jogar

| Sistema     | O que fazer                          |
|-------------|--------------------------------------|
| Windows     | clique duas vezes em `ABRIR_JOGO.bat` |
| macOS/Linux | no terminal: `bash abrir_jogo.sh`     |

O navegador abre sozinho em `http://localhost:8123/index.html`. Deixe o
terminal aberto enquanto joga.

Não adianta abrir o `index.html` direto: o jogo usa módulos JavaScript
(`import`/`export`) e carrega os dados de arquivos `.json`, e todo navegador
bloqueia as duas coisas em `file://`. O servidor local resolve — e roda 100%
offline, nada sai do seu computador.

## Controles

```
W A S D ....... andar              Shift ....... correr / DASH (3 cargas)
Mouse ......... olhar              Ctrl ou C ... slide
Clique esq. ... atacar             F ........... habilidade especial
Clique dir. ... defender/aparar    Q ........... beber poção
Tab ........... inventário         E ........... mercador / portal
Esc ........... pausar
```

Durante o dash você é intangível: golpe, projétil, espinho e fogo passam
direto. Itens são pegos andando por cima deles.

## Estrutura

```
index.html        ponto de entrada
js/               código do jogo (core, entities, world, combat, gfx, ui)
data/             balanceamento, inimigos, itens, armas, armadilhas, loja
css/              estilos de menu e interface
vendor/           three.js (MIT — licença em vendor/THREE_LICENSE.txt)
```

O guia completo de mecânicas está em [DungeonGold/LEIA-ME.txt](DungeonGold/LEIA-ME.txt).

## Requisitos

Python 3 (para o servidor local) e um navegador com suporte a WebGL.
