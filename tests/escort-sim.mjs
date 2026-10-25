// Headless-Test für „Bewachen“: Speerkämpfer begleiten einen Dorfbewohner, wehren Angreifer ab,
// bleiben bei ihm und geben den Befehl auf, wenn er fällt. Ein verbündeter Spieler kann ebenfalls bewachen.
// Welt A läuft durch, Welt B wird mittendrin gespeichert und neu geladen; beide müssen identisch bleiben.
// Aufruf: node tests/escort-sim.mjs [Seed]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const saveSrc = script.slice(script.indexOf('/* ---------- Speichern & Laden'), script.indexOf('function saveMeta('));
const ctx = vm.createContext({ console, performance, btoa, atob, cam: { x: 0, y: 0, zoom: 1 } });
vm.runInContext(simSrc + saveSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, execCmd, stateHash, serializeGame, deserializeGame,
  rebuildGrid, applyDamage, spawnUnit, passableXY, dist, SIM_DT };`, ctx);
const A = ctx.api;
const seed = +(process.argv[2] || 4242);
let fails = 0;
const check = (cond, text) => { console.log((cond ? 'OK     ' : 'FEHLER ') + text); if (!cond) fails++; };

// Spieler 0 und 2 sind verbündet, Spieler 1 ist der Gegner
function setup() {
  const G = A.newGame(seed, 'medium', { human: 0, headless: true, ai: [{ team: 1 }, { team: 0 }] });
  A.G = G; G.ais = []; // keine KI: nur die Befehle des Tests
  for (const p of G.players) { for (const k in p.res) p.res[k] = 5000; p.popCap += 40; }
  const tc = G.buildings.find(b => b.owner === 0 && b.type === 'tc');
  const x = tc.x + 4, y = tc.y + 4;
  const vil = A.spawnUnit('villager', 0, x, y);
  const guards = []; for (let k = 0; k < 3; k++) guards.push(A.spawnUnit('spear', 0, x - 2 - 0.6 * k, y + 1).id);
  const ally = A.spawnUnit('maa', 2, x - 2, y + 2.5);
  // Ziel des Dorfbewohners: ein freies Feld ein Stück weiter
  let goal = null;
  for (let r = 14; r < 30 && !goal; r++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) {
    const gx = Math.floor(x + dx * r), gy = Math.floor(y + dy * r);
    if (!goal && A.passableXY(gx, gy, 0)) goal = { x: gx + 0.5, y: gy + 0.5 };
  }
  return { G, vil: vil.id, guards, ally: ally.id, goal };
}
const worlds = [setup(), setup()];
const unit = (G, id) => G.units.find(u => u.id === id);
const own = (G, p, f) => G.units.filter(u => !u.dead && u.owner === p && (!f || f(u)));
check(worlds[0].G.players.length >= 3 && worlds[0].G.players[2].team === worlds[0].G.players[0].team, 'Spieler 2 ist mit Spieler 0 verbündet');

const plan = {
  5: W => [{ p: 0, c: { c: 'act', ids: W.guards, x: 0, y: 0, t: W.vil } },
    { p: unit(W.G, W.ally).owner, c: { c: 'act', ids: [W.ally], x: 0, y: 0, t: W.vil } }],
  10: W => [{ p: 0, c: { c: 'act', ids: [W.vil], x: W.goal.x, y: W.goal.y, t: 0 } }],
};
let foes = [];
for (let tick = 1; tick <= 2400; tick++) {
  const cmds = plan[tick] ? plan[tick](worlds[0]) : [];
  for (const W of worlds) {
    A.G = W.G;
    for (const { p, c } of cmds) A.execCmd(p, c);
    // Angreifer von Spieler 1 tauchen beim Dorfbewohner auf und greifen ihn an
    if (tick === 700) {
      const v = unit(W.G, W.vil); const ids = [];
      for (let k = 0; k < 1; k++) ids.push(A.spawnUnit('spear', 1, v.x + 5 + (k % 2) * 0.6, v.y + 0.5 * k).id);
      A.execCmd(1, { c: 'act', ids, x: 0, y: 0, t: W.vil });
    }
    // bewachter Dorfbewohner fällt: Wächter geben den Befehl auf
    if (tick === 2000) { const v = unit(W.G, W.vil); if (v && !v.dead) A.applyDamage(v, v.hp + 1, null); }
    A.simStep(A.SIM_DT);
  }
  const W = worlds[0], G = W.G;
  const v = unit(G, W.vil), gs = W.guards.map(id => unit(G, id)).filter(Boolean);
  if (tick === 6) {
    check(gs.length === 3 && gs.every(g => g.order && g.order.t === 'escort' && g.order.target === v), 'Speerkämpfer bewachen den Dorfbewohner');
    const al = unit(G, W.ally);
    check(al && al.order && al.order.t === 'escort', 'verbündete Einheit bewacht ebenfalls');
  }
  if (tick === 650) {
    check(A.dist(v.x, v.y, W.goal.x, W.goal.y) < 1.5, 'Dorfbewohner ist am Ziel');
    const far = Math.max(...gs.map(g => A.dist(g.x, g.y, v.x, v.y)));
    check(far < 3.5, `Wächter sind mitgelaufen (größter Abstand ${far.toFixed(2)})`);
  }
  if (tick === 1200) {
    // Welt B speichern und neu laden
    A.G = worlds[1].G;
    const json = JSON.stringify(A.serializeGame());
    worlds[1].G = A.deserializeGame(JSON.parse(json)); A.G = worlds[1].G; A.rebuildGrid();
    const g2 = worlds[1].G.units.find(u => u.id === W.guards[0]);
    check(g2 && g2.order && g2.order.t === 'escort' && g2.order.target && g2.order.target.id === W.vil, 'Bewachen-Befehl im Spielstand erhalten');
  }
  if (tick === 1500) {
    const left = own(G, 1, u => u.type === 'spear').length;
    check(left === 0, `Angreifer besiegt (${left} übrig)`);
    check(v && !v.dead, `Dorfbewohner überlebt (${v ? Math.round(v.hp) : 0} LP)`);
    const far = Math.max(...gs.map(g => A.dist(g.x, g.y, v.x, v.y)));
    check(far < 4, `Wächter danach wieder beim Dorfbewohner (größter Abstand ${far.toFixed(2)})`);
  }
  if (tick === 2010) check(gs.every(g => !g.order || g.order.t !== 'escort'), 'nach dem Tod des Bewachten kein Bewachen-Befehl mehr');
}
const h = worlds.map(w => { A.G = w.G; return A.stateHash(); });
check(h[0] === h[1], `Welten identisch (Prüfsummen ${h[0]} / ${h[1]})`);
// feindliche Einheiten lassen sich nicht bewachen: Rechtsklick greift weiterhin an
{
  const W = worlds[0]; A.G = W.G;
  const e = A.spawnUnit('spear', 1, W.goal.x + 3, W.goal.y);
  A.execCmd(0, { c: 'act', ids: [W.guards[0]], x: 0, y: 0, t: e.id });
  const g = unit(W.G, W.guards[0]);
  check(g.order && g.order.t === 'attack', 'Rechtsklick auf Gegner greift weiterhin an');
}
console.log(fails ? `FEHLER: ${fails} Prüfungen fehlgeschlagen` : 'OK: Bewachen-Test bestanden');
process.exit(fails ? 1 : 0);
