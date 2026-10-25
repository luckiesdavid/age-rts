// Headless-Test für Fernkämpfer auf Turm und Mauer: hinaufschicken (Verteilung auf Mauerstücke),
// selbst schießen, geschützt bleiben, Spielstand mit Posten, Herunterholen und Herauskommen beim Zerstören.
// Welt A läuft durch, Welt B wird mittendrin gespeichert und neu geladen; beide müssen identisch bleiben.
// Aufruf: node tests/tower-sim.mjs [Seed]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const saveSrc = script.slice(script.indexOf('/* ---------- Speichern & Laden'), script.indexOf('function saveMeta('));
const ctx = vm.createContext({ console, performance, btoa, atob, cam: { x: 0, y: 0, zoom: 1 } });
vm.runInContext(simSrc + saveSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, execCmd, stateHash, serializeGame, deserializeGame,
  rebuildGrid, canPlace, applyDamage, placeBuilding, spawnUnit, SIM_DT, BUILDINGS };`, ctx);
const A = ctx.api;
const seed = +(process.argv[2] || 777);
let fails = 0;
const check = (cond, text) => { console.log((cond ? 'OK     ' : 'FEHLER ') + text); if (!cond) fails++; };

// Turm und fünf Mauerstücke von Spieler 0 vor dem Dorfzentrum, je 4 Bogen- und 3 Armbrustschützen, 1 Speerkämpfer
function setup() {
  const G = A.newGame(seed, null, { net: true, human: 0, headless: true });
  A.G = G;
  for (const p of G.players) { for (const k in p.res) p.res[k] = 5000; p.age = 2; p.popCap += 40; }
  const tc = G.buildings.find(b => b.owner === 0 && b.type === 'tc');
  let spot = null;
  for (let r = 6; r < 20 && !spot; r++) for (let d = -r; d <= r && !spot; d++) {
    const x = Math.floor(tc.x) + r, y = Math.floor(tc.y) + d;
    let ok = A.canPlace('tower', x, y, 0);
    for (let k = 0; k < 5 && ok; k++) ok = A.canPlace('wall', x, y + 3 + k, 0);
    if (ok) spot = [x, y];
  }
  const tower = A.placeBuilding('tower', spot[0], spot[1], 0, true);
  const walls = []; for (let k = 0; k < 5; k++) walls.push(A.placeBuilding('wall', spot[0], spot[1] + 3 + k, 0, true));
  const sx = spot[0] - 2, sy = spot[1] + 2;
  for (let k = 0; k < 4; k++) A.spawnUnit('archer', 0, sx - 0.5 * k, sy);
  for (let k = 0; k < 3; k++) A.spawnUnit('crossbow', 0, sx - 0.5 * k, sy + 1);
  A.spawnUnit('spear', 0, sx, sy + 2);
  return { G, tower: tower.id, walls: walls.map(w => w.id), spot };
}
const worlds = [setup(), setup()];
const ent = (G, id) => G.buildings.find(b => b.id === id);
const own = (G, p, f) => G.units.filter(u => !u.dead && u.owner === p && (!f || f(u)));
const posted = G => G.buildings.reduce((n, b) => n + (b.dead || !b.gar ? 0 : b.gar.length), 0);
let enemies = [];

const plan = {
  // 4 Bogenschützen auf den Turm, 3 Armbrustschützen + Speerkämpfer auf ein Mauerstück (Speer darf nicht hinauf)
  5: W => [{ p: 0, c: { c: 'act', ids: own(W.G, 0, u => u.type === 'archer').map(u => u.id), x: 0, y: 0, t: W.tower } },
    { p: 0, c: { c: 'act', ids: own(W.G, 0, u => u.type === 'crossbow' || u.type === 'spear').map(u => u.id), x: 0, y: 0, t: W.walls[2] } }],
  2600: W => [{ p: 0, c: { c: 'ungar', id: W.tower } }],
};
let hpAtAttack = 0;
for (let tick = 1; tick <= 3000; tick++) {
  const cmds = plan[tick] ? plan[tick](worlds[0]) : [];
  for (const W of worlds) {
    A.G = W.G;
    for (const { p, c } of cmds) A.execCmd(p, c);
    // Gegner (Speerkämpfer von Spieler 1) tauchen vor dem Turm auf
    if (tick === 700) { const t = ent(W.G, W.tower); for (let k = 0; k < 6; k++) A.spawnUnit('spear', 1, t.x + 5 + (k % 3) * 0.6, t.y + 1 + (k >> 1) * 0.6); }
    // besetztes Mauerstück zerstören: der Schütze muss herauskommen
    if (tick === 2200) { const w = W.G.buildings.find(b => !b.dead && b.type === 'wall' && b.gar.length); if (w) A.applyDamage(w, w.hp + 1, null); }
    A.simStep(A.SIM_DT);
  }
  const W = worlds[0], G = W.G;
  if (tick === 600) {
    const t = ent(G, W.tower);
    check(t.gar.length === 4, `4 Bogenschützen auf dem Turm (${t.gar.length})`);
    const ws = W.walls.map(id => ent(G, id).gar.length);
    check(ws.reduce((a, b) => a + b, 0) === 3 && Math.max(...ws) === 1, `Armbrustschützen auf drei Mauerstücke verteilt (${ws.join(',')})`);
    check(own(G, 0, u => u.type === 'spear').length === 1, 'Speerkämpfer bleibt unten');
    check(!G.units.some(u => u.inside), 'Schützen oben stehen nicht in der Einheitenliste');
    hpAtAttack = t.gar.reduce((s, u) => s + u.hp, 0);
  }
  if (tick === 1500) {
    // Welt B speichern und neu laden
    const n = posted(worlds[1].G);
    A.G = worlds[1].G;
    const json = JSON.stringify(A.serializeGame());
    worlds[1].G = A.deserializeGame(JSON.parse(json)); A.G = worlds[1].G; A.rebuildGrid();
    check(posted(worlds[1].G) === n && n === 7, `Posten im Spielstand erhalten (${n})`);
  }
  if (tick === 1600) {
    const t = ent(G, W.tower);
    const left = own(G, 1, u => u.type === 'spear').length;
    check(left === 0, `Angreifer vor dem Turm besiegt (${left} übrig)`);
    check(t.gar.reduce((s, u) => s + u.hp, 0) === hpAtAttack, 'Schützen oben haben keinen Schaden genommen');
    check(G.players[0].stats.kills >= 6, `Abschüsse gezählt (${G.players[0].stats.kills})`);
  }
  if (tick === 2201) check(posted(G) === 6 && own(G, 0, u => u.type === 'crossbow').length === 1, 'Mauer zerstört: Schütze kam herunter');
  if (tick === 2601) check(ent(G, W.tower).gar.length === 0 && own(G, 0, u => u.type === 'archer').length === 4, 'Herunterholen leert den Turm');
}
const G = worlds[0].G;
check(G.units.length === new Set(G.units).size, 'keine doppelten Einheiten');
const h = worlds.map(w => { A.G = w.G; return A.stateHash(); });
check(h[0] === h[1], `Welten identisch (Prüfsummen ${h[0]} / ${h[1]})`);
console.log(fails ? `FEHLER: ${fails} Prüfungen fehlgeschlagen` : 'OK: Turm-Test bestanden');
process.exit(fails ? 1 : 0);
