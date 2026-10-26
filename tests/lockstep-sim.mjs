// Headless-Test für den Mehrspieler-Lockstep: zwei unabhängige Simulationen (wie zwei Rechner)
// tauschen Befehle über eine simulierte, verzögerte Leitung aus. Am Ende müssen beide Zustände
// identisch sein, und die eingebaute Prüfsumme darf keinen Desync melden.
// Aufruf: node tests/lockstep-sim.mjs [Minuten] [Seed] [Latenz in Ticks]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const ctx = vm.createContext({ console, performance });
vm.runInContext(simSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, execCmd, createLockstep, lsQueue,
  lsReceive, lsReady, lsBeginTurn, stateHash, SIM_DT, TURN_TICKS, BUILDINGS, UNITS, TECHS, VILLAGER_BUILDS, canPlace, wallLine };`, ctx);
const A = ctx.api;

const minutes = +(process.argv[2] || 6), seed = +(process.argv[3] || 12345), lag = +(process.argv[4] || 2);
const rich = process.argv[5] !== 'arm'; // Standard: mehr Startressourcen, damit Zeitalter, Forschung und Markt vorkommen
const DELAY = 3;
let rngState = 987654321;
const rand = () => { rngState = (Math.imul(rngState, 1103515245) + 12345) >>> 0; return rngState / 4294967296; };

// Leitung mit Latenz und Schwankung (in Ticks), Reihenfolge bleibt erhalten (wie ein zuverlässiger DataChannel)
const wires = [[], []];
let now = 0;
function wireSend(from, msg) {
  const last = wires[from].length ? wires[from][wires[from].length - 1].at : 0;
  wires[from].push({ at: Math.max(last, now + lag + Math.floor(rand() * (lag + 3))), msg: JSON.parse(JSON.stringify(msg)) });
}
const worlds = [0, 1].map(me => {
  const G = A.newGame(seed, null, { net: true, human: me, headless: true });
  if (rich) for (const p of G.players) for (const k in p.res) p.res[k] = 4000;
  return { me, G, L: A.createLockstep(2, me, DELAY, msg => wireSend(me, msg)), stalls: 0 };
});

// erzeugt zufällige, aber sinnvolle Befehle aus Sicht eines Spielers
function randomCmd(w) {
  const G = w.G, p = w.me;
  const mine = G.units.filter(u => !u.dead && u.owner === p);
  const vills = mine.filter(u => u.type === 'villager');
  const blds = G.buildings.filter(b => !b.dead && b.owner === p);
  const r = rand();
  if (r < 0.35 && vills.length) {
    const res = G.resources.filter(x => !x.dead);
    const t = res[Math.floor(rand() * res.length)];
    return { c: 'act', ids: vills.filter(() => rand() < 0.4).map(u => u.id), x: t.x, y: t.y, t: t.id, am: false };
  }
  if (r < 0.55 && vills.length) {
    const types = ['house', 'barracks', 'range', 'stable', 'farm', 'lumber', 'palisade', 'tower', 'blacksmith', 'market', 'mill', 'keep', 'siege', 'castle'];
    const type = types[Math.floor(rand() * types.length)];
    const tc = blds.find(b => b.type === 'tc') || vills[0];
    const tx = Math.floor(tc.x + (rand() - 0.5) * 16), ty = Math.floor(tc.y + (rand() - 0.5) * 16);
    const tiles = type === 'palisade' ? A.wallLine(tx, ty, tx + 4, ty).map(t => [t.x, t.y]) : [[tx, ty]];
    const k0 = Math.floor(rand() * vills.length);
    return { c: 'build', ids: vills.slice(k0, k0 + (A.BUILDINGS[type].landmark ? 5 : 1)).map(u => u.id), type, tiles, rot: rand() < 0.5 ? 1 : 0 };
  }
  if (r < 0.75 && blds.length) {
    const b = blds[Math.floor(rand() * blds.length)];
    const d = A.BUILDINGS[b.type], tr = d.trains, te = d.techs;
    if (te && rand() < 0.4) return { c: 'res', id: b.id, tech: te[Math.floor(rand() * te.length)] };
    if (d.market) return { c: 'mkt', r: ['food', 'wood', 'stone'][Math.floor(rand() * 3)], buy: rand() < 0.5 };
    if (tr) return { c: 'train', ids: [b.id], type: tr[Math.floor(rand() * tr.length)], n: 1 + Math.floor(rand() * 3) };
  }
  // Burg / Bergfried besetzen oder räumen
  const fort = blds.find(b => b.built && b.gar);
  if (r < 0.8 && fort) {
    if (fort.gar.length && rand() < 0.4) return { c: 'ungar', id: fort.id };
    return { c: 'act', ids: mine.filter(() => rand() < 0.3).map(u => u.id), x: fort.x, y: fort.y, t: fort.id, am: false };
  }
  if (r < 0.95) {
    const army = mine.filter(u => u.type !== 'villager');
    if (army.length) {
      const enemy = G.buildings.find(b => !b.dead && b.owner === 1 - p);
      const tgt = enemy && rand() < 0.5 ? enemy : { x: 5 + rand() * 54, y: 5 + rand() * 54, id: 0 };
      return { c: 'act', ids: army.map(u => u.id), x: tgt.x, y: tgt.y, t: tgt.id, am: rand() < 0.5 };
    }
  }
  if (mine.length) return { c: 'stop', ids: [mine[Math.floor(rand() * mine.length)].id] };
  return null;
}

// Feste Abläufe: zu diesen Ticks bauen alle Dorfbewohner ein Wahrzeichen (danach 80 s keine Zufallsbefehle für Dorfbewohner)
const SCRIPT = { 900: ['lm_school', 'lm_market'], 5400: ['lm_fort', 'lm_treasury'], 8100: ['castle', 'castle'], 10800: ['lm_academy', 'lm_cathedral'] };
function scriptedCmd(w) {
  const lm = SCRIPT[w.G.tick]; if (!lm || !rich) return null;
  const G = w.G, p = w.me, type = lm[p];
  const tc = G.buildings.find(b => !b.dead && b.owner === p && b.type === 'tc'); if (!tc) return null;
  let spot = null;
  for (let r = 4; r < 20 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const x = Math.floor(tc.x) + dx, y = Math.floor(tc.y) + dy; if (A.canPlace(type, x, y, p)) spot = [x, y];
  }
  if (!spot) return null;
  w.quietUntil = G.tick + 80 * 30;
  return { c: 'build', ids: G.units.filter(u => !u.dead && u.owner === p && u.type === 'villager').map(u => u.id), type, tiles: [spot] };
}
const maxTicks = minutes * 60 * 30;
let tick = 0, cmdsSent = 0;
while (tick < maxTicks * 3) {
  now++;
  for (const w of worlds) {
    const other = 1 - w.me;
    while (wires[other].length && wires[other][0].at <= now) A.lsReceive.call(null, w.L, other, wires[other].shift().msg);
  }
  for (const w of worlds) {
    A.G = w.G;
    if (w.G.over || w.G.tick >= maxTicks) continue;
    const sc = scriptedCmd(w); if (sc) { A.lsQueue(w.L, sc); cmdsSent++; }
    if (rand() < 0.04) { const c = randomCmd(w); if (c && !(w.quietUntil > w.G.tick && c.ids && c.ids.some(id => { const e = w.G.byId.get(id); return e && e.type === 'villager'; }))) { A.lsQueue(w.L, c); cmdsSent++; } }
    if (w.G.tick % A.TURN_TICKS === 0) {
      if (!A.lsReady(w.L)) { w.stalls++; continue; }
      A.lsBeginTurn(w.L);
    }
    A.simStep(A.SIM_DT);
  }
  tick++;
  if (worlds.every(w => w.G.over || w.G.tick >= maxTicks)) break;
}
const hashes = worlds.map(w => { A.G = w.G; return A.stateHash(); });
const summary = worlds.map(w => ({
  tick: w.G.tick, units: w.G.units.filter(u => !u.dead).length, buildings: w.G.buildings.filter(b => !b.dead).length,
  res: w.G.players.map(p => Object.values(p.res).map(Math.floor).join('/')), age: w.G.players.map(p => p.age),
  techs: w.G.players.map(p => Object.keys(p.techs).length), castles: w.G.buildings.filter(b => !b.dead && b.type === 'castle').length,
  garrisoned: w.G.buildings.reduce((n, b) => n + (b.dead || !b.gar ? 0 : b.gar.length), 0), rotated: w.G.buildings.filter(b => b.rot === 1).length, stalls: w.stalls, desync: w.L.desync, over: w.G.over,
}));
console.log(JSON.stringify({ cmdsSent, hashes, summary }, null, 1));
// Spielstatistik (Endbildschirm) muss auf beiden Rechnern gleich sein und den Verlauf mitschreiben
const statsJson = worlds.map(w => JSON.stringify(w.G.players.map(p => p.stats)));
const st = worlds[0].G.players[0].stats;
console.log('Statistik Spieler 1:', JSON.stringify({ ...st, hist: st.hist.length + ' Punkte' }));
const statsOk = statsJson[0] === statsJson[1] && st.hist.length > 0 && st.gathered > 0 && st.g.food + st.g.wood + st.g.gold + st.g.stone === st.gathered;
if (!statsOk) console.log('FEHLER: Statistik weicht ab oder fehlt');
const ok = statsOk && hashes[0] === hashes[1] && worlds.every(w => w.L.desync < 0) && summary[0].tick === summary[1].tick
  && summary[0].rotated > 0 && summary[0].rotated === summary[1].rotated;
console.log(ok ? 'OK: beide Simulationen identisch' : 'FEHLER: Simulationen weichen ab');
process.exit(ok ? 0 : 1);
