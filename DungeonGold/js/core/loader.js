// ============================================================
// Carregador dos arquivos de dados (JSON).
// ============================================================

export const Dados = {
  inimigos: null,
  itens: null,
  balanceamento: null,
  desbloqueios: null,
  armas: null,
  armadilhas: null,
  loja: null,
  chefeFinal: null,
};

const ARQUIVOS = [
  ['inimigos', 'data/enemies.json'],
  ['itens', 'data/items.json'],
  ['balanceamento', 'data/balance.json'],
  ['desbloqueios', 'data/unlocks.json'],
  ['armas', 'data/weapons.json'],
  ['armadilhas', 'data/traps.json'],
  ['loja', 'data/shop.json'],
  ['chefeFinal', 'data/bosses.json'],
];

export async function carregarDados(aoProgredir = () => {}) {
  let feitos = 0;
  for (const [chave, caminho] of ARQUIVOS) {
    aoProgredir(feitos / ARQUIVOS.length, caminho);
    const resp = await fetch(caminho);
    if (!resp.ok) throw new Error(`Falha ao carregar ${caminho} (HTTP ${resp.status})`);
    Dados[chave] = await resp.json();
    feitos++;
  }
  aoProgredir(1, 'pronto');
  return Dados;
}
