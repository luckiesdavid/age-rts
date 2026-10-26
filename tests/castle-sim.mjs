// Headless-Test für die Burg: Bau, Besatzung (hinein, heraus, beim Zerstören), Burgeinheiten,
// Burg-Technologien und Spielstand mit Besatzung. Welt A läuft durch, Welt B wird mittendrin
// gespeichert und neu geladen; beide bekommen dieselben Befehle und müssen identisch bleiben.
// Aufruf: node tests/castle-sim.mjs [Seed]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const saveSrc = script.slice(script.indexOf('/* ---------- Speichern & Laden'), script.indexOf('function saveMeta('));
const ctx = vm.createContext({ console, performance, btoa, atob, cam: { x: 0, y: 0, zoom: 1 } });
vm.runInContext(simSrc + saveSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, execCmd, stateHash, serializeGame, deserializeGame,
  rebuildGrid, canPlace, applyDamage, recalcPlayer, SIM_DT, BUILDINGS };`, ctx);
const A = ctx.api;
const seed = +(process.argv[2] || 777);
let fails = 0;
const check = (cond, text) => { console.log((cond ? 'OK     ' : 'FEHLER ') + text); if (!cond) fails++; };

function setup() {
  const G = A.newGame(seed, null, { net: true, human: 0, headless: true });
  for (const p of G.players) { for (const k in p.res) p.res[k] = 5000; p.age = 2; p.popCap += 40; }
  return G;
}
const worlds = [setup(), setup()];
const spotFor = (G, p, type) => {
  const tc = G.buildings.find(b => b.owner === p && b.type === 'tc');
  for (let r = 5; r < 22; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(tc.x) + dx, y = Math.floor(tc.y) + dy; if (A.canPlace(type, x, y, p)) return [x, y];
  }
  return null;
};
const own = (G, p, f) => G.units.filter(u => !u.dead && u.owner === p && (!f || f(u)));
const castleOf = (G, p) => G.buildings.find(b => !b.dead && b.owner === p && b.type === 'castle');
const gar = G => G.buildings.reduce((n, b) => n + (b.dead || !b.gar ? 0 : b.gar.length), 0);
const garPeak = G => G.buildings.reduce((n, b) => Math.max(n, b.dead || !b.gar ? 0 : b.gar.length), 0);

// Befehle je Tick (aus Sicht von Welt A berechnet, dann in beiden Welten gleich ausgeführt)
const plan = {
  1: G => [0, 1].map(p => ({ p, c: { c: 'build', ids: own(G, p).map(u => u.id), type: 'castle', tiles: [spotFor(G, p, 'castle')], rot: p } })),
  2400: G => [0, 1].flatMap(p => { const b = castleOf(G, p); return b ? [{ p, c: { c: 'train', ids: [b.id], type: 'longbow', n: 5 } }, { p, c: { c: 'train', ids: [b.id], type: 'ordensritter', n: 2 } }] : []; }),
  2401: G => [0, 1].flatMap(p => { const b = castleOf(G, p); return b ? [{ p, c: { c: 'res', id: b.id, tech: 'firearrows' } }] : []; }),
  4200: G => [0, 1].flatMap(p => { const b = castleOf(G, p); return b ? [{ p, c: { c: 'act', ids: own(G, p).map(u => u.id), x: b.x, y: b.y, t: b.id } }] : []; }),
  5400: G => [{ p: 0, c: { c: 'ungar', id: castleOf(G, 0).id } }],
  5700: G => { const b = castleOf(G, 0); return [{ p: 0, c: { c: 'act', ids: own(G, 0).map(u => u.id), x: b.x, y: b.y, t: b.id } }, { p: 0, c: { c: 'res', id: b.id, tech: 'hoardings' } }]; },
  7300: G => { const b = castleOf(G, 0); return [{ p: 0, c: { c: 'train', ids: [b.id], type: 'onager', n: 1 } }, { p: 0, c: { c: 'train', ids: [b.id], type: 'ballista', n: 1 } }]; },
};
let garMax = 0, garAtSave = 0;
for (let tick = 1; tick <= 12000; tick++) {
  const cmds = plan[tick] ? plan[tick](worlds[0]) : [];
  for (const G of worlds) {
    A.G = G;
    for (const { p, c } of cmds) A.execCmd(p, c);
    // Burg von Spieler 1 in beiden Welten gleichzeitig mit Schaden zerstören (Besatzung muss herauskommen)
    if (tick === 8000) { const b = castleOf(G, 1); if (b) A.applyDamage(b, b.hp + 1, null); }
    A.simStep(A.SIM_DT);
  }
  if (tick === 3000) {
    const b = castleOf(worlds[0], 0);
    check(!!b && b.built, 'Burg gebaut und fertig');
  }
  if (tick === 4500) {
    A.G = worlds[0];
    garAtSave = gar(worlds[0]);
    // Welt B speichern und neu laden (wie Spielstand / Mehrspieler-Fortsetzen)
    A.G = worlds[1];
    const json = JSON.stringify(A.serializeGame());
    worlds[1] = A.deserializeGame(JSON.parse(json)); A.G = worlds[1]; A.rebuildGrid();
    check(gar(worlds[1]) === garAtSave && garAtSave > 0, `Besatzung im Spielstand erhalten (${garAtSave})`);
    const inList = worlds[1].units.some(u => u.inside);
    check(!inList, 'Besatzer stehen nicht in der Einheitenliste');
  }
  garMax = Math.max(garMax, garPeak(worlds[0]));
  if (tick === 5401) check(castleOf(worlds[0], 0).gar.length === 0, 'Herauslassen leert die Burg');
  if (tick === 8001) {
    const G = worlds[0];
    check(!castleOf(G, 1), 'Burg von Spieler 1 zerstört');
    check(own(G, 1).length === G.players[1].pop, `Besatzung kam heraus (${own(G, 1).length} Einheiten, Bevölkerung ${G.players[1].pop})`);
  }
}
const G = worlds[0];
check(garMax === 12, `Burg war voll besetzt (max. ${garMax})`);
check(G.players[0].techs.firearrows && G.players[0].towerAtk === 3, 'Brandpfeile erforscht');
const c0 = castleOf(G, 0);
check(G.players[0].techs.hoardings && Math.abs(c0.maxHp - 5500 * 1.25) < 1e-6, 'Wehrgänge: Burg hat +25 % LP');
check(own(G, 0, u => u.type === 'longbow').length + c0.gar.filter(u => u.type === 'longbow').length === 5, 'Langbogenschützen ausgebildet');
check(['onager', 'ballista'].every(t => own(G, 0, u => u.type === t).length === 1), 'Onager und Balliste in der Burg ausgebildet');
check(G.units.length === new Set(G.units).size, 'keine doppelten Einheiten');
const h = worlds.map(w => { A.G = w; return A.stateHash(); });
check(h[0] === h[1], `Welten identisch (Prüfsummen ${h[0]} / ${h[1]})`);
console.log(fails ? `FEHLER: ${fails} Prüfungen fehlgeschlagen` : 'OK: Burg-Test bestanden');
process.exit(fails ? 1 : 0);
