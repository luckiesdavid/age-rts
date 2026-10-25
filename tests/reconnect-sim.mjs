// Headless-Test für Verbindungsabbrüche im Mehrspieler:
//  1. Kurzer Abbruch: Eine Zeit lang gehen alle Nachrichten verloren. Danach liefert jede Seite ihre
//     Turn-Nachrichten ab dem Turn des Mitspielers nach (wie beim 'hello' nach dem Neuverbinden).
//  2. Fortsetzen aus dem Zwischenspeicher: Der Stand einer Seite wird serialisiert, beide laden ihn
//     und spielen mit einem frischen Lockstep (neue Epoche) weiter.
// In beiden Fällen müssen die Simulationen danach identisch bleiben.
// Aufruf: node tests/reconnect-sim.mjs [Seed]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const simSrc = script.slice(0, script.indexOf('/* ============================ 9. RENDERING'));
const saveSrc = script.slice(script.indexOf('/* ---------- Speichern & Laden'), script.indexOf('function saveMeta('));
const ctx = vm.createContext({ console, performance, btoa, atob, cam: { x: 0, y: 0, zoom: 1 } });
vm.runInContext(simSrc + saveSrc + `
globalThis.api = { get G() { return G; }, set G(v) { G = v; }, newGame, simStep, createLockstep, lsQueue, lsReceive, lsReady,
  lsBeginTurn, lsResendFrom, stateHash, serializeGame, deserializeGame, rebuildGrid, TURN_TICKS, SIM_DT, BUILDINGS };`, ctx);
const A = ctx.api;

const seed = +(process.argv[2] || 4242);
let rngState = 13579;
const rand = () => { rngState = (Math.imul(rngState, 1103515245) + 12345) >>> 0; return rngState / 4294967296; };

let now = 0, cut = false;
const wires = [[], []];
function wireSend(from, msg) {
  if (cut) return; // Leitung tot: Nachricht geht verloren
  const last = wires[from].length ? wires[from][wires[from].length - 1].at : 0;
  wires[from].push({ at: Math.max(last, now + 2 + Math.floor(rand() * 4)), msg: JSON.parse(JSON.stringify(msg)) });
}
const makeL = (me, e) => A.createLockstep(2, me, 3, msg => wireSend(me, msg), e);
const worlds = [0, 1].map(me => ({ me, G: A.newGame(seed, null, { net: true, human: me, headless: true }), L: makeL(me, 0) }));

function randomCmd(w) {
  const G = w.G, p = w.me;
  const vills = G.units.filter(u => !u.dead && u.owner === p && u.type === 'villager');
  const blds = G.buildings.filter(b => !b.dead && b.owner === p);
  const r = rand();
  if (r < 0.5 && vills.length) {
    const res = G.resources.filter(x => !x.dead); const t = res[Math.floor(rand() * res.length)];
    return { c: 'act', ids: vills.filter(() => rand() < 0.5).map(u => u.id), x: t.x, y: t.y, t: t.id, am: false };
  }
  if (blds.length) {
    const b = blds[Math.floor(rand() * blds.length)]; const tr = A.BUILDINGS[b.type].trains;
    if (tr) return { c: 'train', ids: [b.id], type: tr[0], n: 1 };
  }
  const army = G.units.filter(u => !u.dead && u.owner === p && u.type !== 'villager');
  if (army.length) return { c: 'act', ids: army.map(u => u.id), x: 5 + rand() * 54, y: 5 + rand() * 54, t: 0, am: true };
  return null;
}
// only: nur diese Seite rechnet weiter (zum Angleichen vor dem Vergleich), ohne neue Befehle
function run(ticks, only) {
  const end = now + (only === undefined ? ticks * 3 : ticks);
  let stalls = 0;
  while (now < end) {
    now++;
    for (const w of worlds) {
      const other = 1 - w.me;
      while (wires[other].length && wires[other][0].at <= now) {
        const m = wires[other].shift().msg;
        if ((m.e | 0) === w.L.e) A.lsReceive(w.L, other, m);
      }
    }
    for (const w of worlds) {
      A.G = w.G;
      if (w.G.over || w.G.tick >= worlds[1 - w.me].G.tick + 200 || (only !== undefined && w.me !== only)) continue;
      if (only === undefined && rand() < 0.04) { const c = randomCmd(w); if (c) A.lsQueue(w.L, c); }
      if (w.G.tick % A.TURN_TICKS === 0) { if (!A.lsReady(w.L)) { stalls++; continue; } A.lsBeginTurn(w.L); }
      A.simStep(A.SIM_DT);
    }
  }
  return stalls;
}
function check(label) {
  // beide auf denselben Tick bringen (der Langsamere holt auf), dann vergleichen
  for (let i = 0; i < 2000 && worlds[0].G.tick !== worlds[1].G.tick; i++) run(1, worlds[0].G.tick < worlds[1].G.tick ? 0 : 1);
  const h = worlds.map(w => { A.G = w.G; return A.stateHash(); });
  const ok = h[0] === h[1] && worlds.every(w => w.L.desync < 0);
  console.log(`${ok ? 'OK    ' : 'FEHLER'} ${label}: Tick ${worlds[0].G.tick}/${worlds[1].G.tick}, Prüfsummen ${h[0]} / ${h[1]}, Desync ${worlds.map(w => w.L.desync)}`);
  return ok;
}

let ok = true;
run(900);
ok = check('vor dem Abbruch') && ok;

// 1. Kurzer Abbruch, mehrmals hintereinander
for (let k = 0; k < 3; k++) {
  cut = true; wires[0].length = 0; wires[1].length = 0; // was unterwegs war, ist verloren
  const stalls = run(150 + k * 100);
  cut = false;
  // Neuverbinden: beide schicken ihren Turn im 'hello', die Gegenseite liefert nach
  const turns = worlds.map(w => w.L.turn);
  for (const w of worlds) for (const m of A.lsResendFrom(w.L, turns[1 - w.me])) wireSend(w.me, m);
  console.log(`Abbruch ${k + 1}: Turns beim Neuverbinden ${turns}, ${stalls} Warte-Ticks, nachgeliefert ${worlds.map(w => A.lsResendFrom(w.L, turns[1 - w.me]).length)}`);
  run(700);
  ok = check('nach Abbruch ' + (k + 1)) && ok;
}

// 2. Fortsetzen aus dem Zwischenspeicher (Seite 1 ist weiter und gewinnt; danach neue Epoche)
run(300);
A.G = worlds[1].G;
const json = JSON.stringify(A.serializeGame());
console.log(`Spielstand: ${(json.length / 1024).toFixed(0)} KB bei Tick ${worlds[1].G.tick}`);
wires[0].length = 0; wires[1].length = 0;
for (const w of worlds) {
  w.G = A.deserializeGame(JSON.parse(json)); A.G = w.G; w.G.human = w.me; A.rebuildGrid();
  w.L = makeL(w.me, 1);
}
run(1500);
ok = check('nach dem Fortsetzen') && ok;

console.log(ok ? 'OK: alle Fälle synchron' : 'FEHLER: Simulationen weichen ab');
process.exit(ok ? 0 : 1);
