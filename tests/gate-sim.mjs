// Headless-Test: Tor in eine bestehende Palisade bzw. Steinmauer setzen (ersetzt das Mauerstück wie in AoE).
// Dorfbewohner baut das Tor, eigene Einheiten laufen hindurch, Feinde nicht. Zwei Welten müssen identisch bleiben.
// Aufruf: node tests/gate-sim.mjs [Seed]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const ctx = vm.createContext({ console, performance, btoa, atob, cam: { x: 0, y: 0, zoom: 1 } });
vm.runInContext(simSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, execCmd, stateHash, canPlace, placeBuilding,
  spawnUnit, findPath, SIM_DT, N };`, ctx);
const A = ctx.api;
const seed = +(process.argv[2] || 4242);
let fails = 0;
const check = (cond, text) => { console.log((cond ? 'OK     ' : 'FEHLER ') + text); if (!cond) fails++; };

// Je eine Palisaden- und eine Steinmauerlinie (7 Stücke, senkrecht) von Spieler 0 neben dem Dorfzentrum
function setup() {
  const G = A.newGame(seed, null, { net: true, human: 0, headless: true });
  A.G = G;
  for (const p of G.players) { for (const k in p.res) p.res[k] = 5000; p.age = 2; }
  const tc = G.buildings.find(b => b.owner === 0 && b.type === 'tc');
  const spots = [];
  for (let r = 6; r < 30 && spots.length < 2; r++) for (let d = -r; d <= r && spots.length < 2; d++) {
    const x = Math.floor(tc.x) + r, y = Math.floor(tc.y) + d;
    let ok = true;
    for (let k = -1; k < 8 && ok; k++) for (let dx = -2; dx <= 2 && ok; dx++) ok = A.canPlace('wall', x + dx, y + k, 0);
    if (ok && !spots.some(s => Math.abs(s[0] - x) < 6)) spots.push([x, y]);
  }
  const lines = { palisade: [], wall: [] };
  ['palisade', 'wall'].forEach((type, n) => { for (let k = 0; k < 7; k++) lines[type].push(A.placeBuilding(type, spots[n][0], spots[n][1] + k, 0, true).id); });
  const v = G.units.filter(u => u.owner === 0 && u.type === 'villager').slice(0, 2).map(u => u.id);
  return { G, spots, lines, v };
}
const worlds = [setup(), setup()];
const W0 = worlds[0];
const at = (G, x, y) => G.bld[y * A.N + x];
{
  A.G = W0.G; const [p, w] = W0.spots;
  check(A.canPlace('pgate', p[0], p[1] + 3, 0), 'Palisadentor auf eigene Palisade setzbar');
  check(A.canPlace('sgate', w[0], w[1] + 3, 0), 'Steintor auf eigene Steinmauer setzbar');
  check(!A.canPlace('pgate', w[0], w[1] + 3, 0), 'Palisadentor nicht auf Steinmauer');
  check(!A.canPlace('sgate', p[0], p[1] + 3, 0), 'Steintor nicht auf Palisade');
  check(!A.canPlace('pgate', p[0], p[1] + 3, 1), 'Gegner kann kein Tor in fremde Palisade setzen');
}
const res0 = { wood: W0.G.players[0].res.wood, stone: W0.G.players[0].res.stone };
for (let tick = 1; tick <= 1800; tick++) {
  for (const W of worlds) {
    A.G = W.G;
    if (tick === 5) {
      A.execCmd(0, { c: 'build', ids: [W.v[0]], type: 'pgate', tiles: [[W.spots[0][0], W.spots[0][1] + 3]] });
      A.execCmd(0, { c: 'build', ids: [W.v[1]], type: 'sgate', tiles: [[W.spots[1][0], W.spots[1][1] + 3]] });
    }
    A.simStep(A.SIM_DT);
  }
  if (tick === 5) {
    const G = W0.G, pl = G.players[0];
    check(pl.res.wood === res0.wood - 25 && pl.res.stone === res0.stone - 30, 'Torkosten bezahlt');
    check(at(G, W0.spots[0][0], W0.spots[0][1] + 3).type === 'pgate' && at(G, W0.spots[1][0], W0.spots[1][1] + 3).type === 'sgate', 'Mauerstücke durch Tore ersetzt');
    check(W0.lines.palisade.filter(id => G.byId.get(id).dead).length === 1 && W0.lines.wall.filter(id => G.byId.get(id).dead).length === 1, 'genau ein Mauerstück je Linie entfernt');
  }
}
{
  const G = W0.G; A.G = G;
  const pg = at(G, W0.spots[0][0], W0.spots[0][1] + 3), sg = at(G, W0.spots[1][0], W0.spots[1][1] + 3);
  check(pg.built && sg.built, `Tore fertig gebaut (${pg.built}/${sg.built})`);
  for (const [n, s] of [['Palisade', W0.spots[0]], ['Mauer', W0.spots[1]]]) {
    const y = s[1] + 3, goal = { x: s[0] + 2.5, y: y + 0.5, r: 0.5 };
    const own = A.findPath(s[0] - 2, y, goal, 0), foe = A.findPath(s[0] - 2, y, goal, 1);
    const through = r => r.reached && r.path.length < 8;
    check(through(own), `${n}: eigener Weg führt durch das Tor (${own.path.length} Schritte)`);
    check(!through(foe), `${n}: Feind kommt nicht durch das Tor (${foe.reached ? foe.path.length + ' Schritte' : 'kein Weg'})`);
  }
}
const h = worlds.map(w => { A.G = w.G; return A.stateHash(); });
check(h[0] === h[1], `Welten identisch (Prüfsummen ${h[0]} / ${h[1]})`);
console.log(fails ? `FEHLER: ${fails} Prüfungen fehlgeschlagen` : 'OK: Tor-Test bestanden');
process.exit(fails ? 1 : 0);
