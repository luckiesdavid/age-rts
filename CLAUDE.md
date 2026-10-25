# Hinweise für Claude

- Softwareversion: Bei **jeder** Änderung `GAME_VERSION` oben im Skript von `index.html` hochzählen (1.5 → 1.6 → …) und dem Nutzer die neue Version nennen. Sie steht im Hauptmenü, im Mehrspieler-Menü und im Mehrspieler oben rechts. GitHub Pages speichert bis zu 10 Minuten zwischen; mit `?v=<Version>` lässt sich das umgehen.
- Antworten auf Deutsch.
- Die Simulation (Abschnitte 1–8 in `index.html`) muss deterministisch bleiben (Mehrspieler-Lockstep): Zufall nur über `rnd()`, kein Math.random/hypot/sin/cos/atan2 mit Einfluss auf den Spielzustand. Tests: `node tests/lockstep-sim.mjs`, `node tests/reconnect-sim.mjs`.
