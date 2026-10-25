# Burgfeld

Ein isometrisches Echtzeit-Strategiespiel für den Browser: 1 gegen 1 gegen eine KI oder online gegen einen anderen Menschen. Baue eine Siedlung auf, sammle Ressourcen, sichere deine Basis mit Mauern und Türmen und zerstöre die gegnerische Siedlung.

Alles steckt in einer einzigen Datei (`index.html`). Es gibt keine externen Grafiken oder Build-Schritte (nur der Mehrspielermodus lädt die Netzwerkbibliothek PeerJS nach); alle Gebäude, Einheiten und das Gelände werden prozedural auf dem Canvas gezeichnet.

## Starten

`index.html` per Doppelklick öffnen (Safari oder Chrome). Im Startbildschirm die Schwierigkeit und die Karte wählen (**Wüste**: Sand, Oasen mit Palmen, wenig Holz, ein zusätzliches Goldvorkommen · **Ausgeglichen**: Wiesen, Wälder und Seen · **Waldland**: dichte Wälder mit Lichtungen), optional einen Karten-Seed eingeben (gleicher Seed = gleiche Karte) und auf **Spiel starten** klicken.

**Speichern:** Im Pausenmenü (oder mit **F5** bzw. **Cmd/Ctrl + S**) gibt es drei Speicherplätze. Zusätzlich speichert das Spiel alle zwei Minuten Spielzeit und beim Schließen des Tabs automatisch. Im Startbildschirm setzt **Letzten Spielstand fortsetzen** den neuesten Stand fort, **Spiel laden** zeigt alle Plätze. Spielstände liegen im Speicher des Browsers (localStorage), also nur in dem Browser, in dem gespielt wurde.

## Mehrspieler über das Internet

Zwei Personen können gegeneinander spielen, auch wenn sie in verschiedenen Netzwerken sind (Internetverbindung nötig).

1. Eine Person öffnet das Spiel, klickt auf **Mehrspieler über das Internet** und dann auf **Erstellen**.
2. Sie schickt den angezeigten **Einladungslink** (Knopf „Link kopieren“, z. B. per WhatsApp). Der Mitspieler muss nur auf den Link klicken und ist sofort verbunden – ohne Download und ohne Code abzutippen.
3. Sobald beide verbunden sind, startet der Ersteller das Spiel. Karte und Seed bestimmt der Ersteller. Der Ersteller spielt Blau, der Beitretende Rot.

Der Link zeigt auf die Online-Version unter <https://luckiesdavid.github.io/age-rts/> (GitHub Pages). Alternativ kann der Mitspieler den 6-stelligen Code bei **Spiel beitreten** eingeben. Beide müssen dieselbe Spielversion verwenden; am einfachsten spielen beide die Online-Version.

**Technik:** Die Browser verbinden sich direkt per WebRTC (Bibliothek [PeerJS](https://peerjs.com), wird nur im Mehrspielermodus aus dem CDN geladen). Der kostenlose öffentliche PeerJS-Server vermittelt nur den Verbindungsaufbau; STUN und TURN sorgen dafür, dass die Verbindung auch hinter Routern (NAT) und Firewalls zustande kommt. Das Spiel läuft im *deterministischen Lockstep*: Beide Rechner simulieren dasselbe Spiel, es werden nur die Befehle der Spieler übertragen (einige Bytes pro 100 ms). Befehle werden je nach gemessenem Ping 200–800 ms in der Zukunft eingeplant, damit sie bei beiden gleichzeitig ausgeführt werden. Eine Prüfsumme pro Sekunde erkennt, falls die Spielstände doch auseinanderlaufen.

**Hinweise:**
- Speichern und Laden gibt es nur im Einzelspieler.
- Pause (Leertaste/P) gilt für beide. **Aufgeben & Hauptmenü** beendet das Spiel; der Mitspieler gewinnt.
- Wechselt ein Spieler den Tab, hält der Browser das Spiel an; der Mitspieler sieht dann „Warte auf Mitspieler …“.
- Eigener Vermittlungsserver statt des öffentlichen: `npx -p peer peerjs --port 9000` starten und das Spiel mit `index.html#peer=dein-server:9000` öffnen (beide Spieler).
- Test der Lockstep-Logik ohne Browser: `node tests/lockstep-sim.mjs [Minuten] [Seed] [Latenz in Ticks]`.

**Ziel:** Zerstöre alle gegnerischen Gebäude (Mauern zählen nicht) – oder sein Dorfzentrum und alle seine Einheiten. Umgekehrt verlierst du.

## Steuerung (Mac mit Maus oder Trackpad)

| Eingabe | Wirkung |
|---|---|
| Linksklick | auswählen |
| Ziehen | Rahmenauswahl |
| Shift + Klick / Ziehen | zur Auswahl hinzufügen bzw. entfernen |
| Doppelklick | alle gleichartigen Einheiten/Gebäude im Bild auswählen |
| Rechtsklick oder **Ctrl + Klick** | bewegen, angreifen, sammeln, bauen/reparieren, Ressourcen abgeben |
| Rechtsklick mit ausgewähltem Produktionsgebäude | Sammelpunkt setzen (auf Ressource: neue Dorfbewohner sammeln dort) |
| **A + Klick** (oder Alt + Rechtsklick, oder Schaltfläche) | Angriffsbewegung |
| WASD / Pfeiltasten / Mauszeiger am Bildschirmrand | Kamera bewegen (A bewegt die Kamera nur, wenn kein Militär ausgewählt ist) |
| Mausrad / Trackpad-Pinch | Zoom; seitliches Wischen auf dem Trackpad schwenkt |
| Mittlere Maustaste ziehen | Kamera verschieben |
| Minikarte anklicken/ziehen | Kamera springt dorthin (Rechtsklick: Bewegungsbefehl) |
| H | Dorfzentrum auswählen |
| . (Punkt) | nächsten untätigen Dorfbewohner auswählen |
| Ctrl + 1–9 (oder Cmd/Alt) | Gruppe speichern |
| 1–9 | Gruppe auswählen (zweimal schnell: Kamera springt hin) |
| Q / E / R / F / T / G | Schaltflächen der Befehlsleiste (Kürzel stehen auf den Knöpfen) |
| X | Halt |
| Entf / Backspace | Gebäude abreißen bzw. Einheit entlassen |
| Esc | Bauen/Befehl abbrechen, Menü zurück, Auswahl aufheben |
| Leertaste / P | Pause |
| F5 oder Cmd/Ctrl + S | Speichern-Dialog |

**Bauen:** Dorfbewohner auswählen, Menü **Wirtschaft (Q)**, **Militär (E)** oder **Verteidigung (R)** öffnen, Gebäude wählen und platzieren. Die Vorschau zeigt grün (möglich) oder rot (blockiert). Mit Shift bleibst du im Platzierungsmodus. Mehrere Dorfbewohner bauen schneller. Unfertige oder beschädigte eigene Gebäude werden per Rechtsklick weitergebaut bzw. repariert.

**Mauern:** Palisade oder Steinmauer wählen und **klicken und ziehen**: Die Mauer wird Kachel für Kachel entlang der Linie gesetzt (Kosten pro Segment). Ein Tor kann auf ein bestehendes eigenes Mauerstück gleichen Materials gesetzt werden. Eigene Einheiten gehen durch Tore, gegnerische nicht.

**Produktion:** Gebäude anwählen und Einheit anklicken (Shift + Klick = 5 Stück). Die Warteschlange erscheint im Infobereich; ein Klick auf einen Eintrag bricht ihn ab und erstattet die Kosten.

## Ressourcen

| Ressource | Quelle | Lager |
|---|---|---|
| Nahrung | Beerensträucher, Wild (erst jagen), Bauernhöfe (unerschöpflich, 1 Dorfbewohner je Hof) | Dorfzentrum, Mühle |
| Holz | Bäume | Dorfzentrum, Holzlager |
| Gold | Goldvorkommen | Dorfzentrum, Bergbaulager |
| Stein | Steinvorkommen | Dorfzentrum, Bergbaulager |

Das Bevölkerungslimit steigt mit jedem Haus um 10 (Dorfzentrum: 10, Maximum 200).

## Gebäude

| Gebäude | Kosten | Funktion |
|---|---|---|
| Dorfzentrum | 350 Holz, 250 Stein | bildet Dorfbewohner aus, Lager für alles, +10 Bevölkerung, schießt Pfeile |
| Haus | 50 Holz | +10 Bevölkerung |
| Mühle | 50 Holz | Nahrungslager |
| Holzlager | 50 Holz | Holzlager |
| Bergbaulager | 50 Holz | Gold- und Steinlager |
| Bauernhof | 75 Holz | unerschöpfliche Nahrung |
| Kaserne | 150 Holz | Speerkämpfer |
| Schießstand | 150 Holz | Bogenschützen |
| Stall | 150 Holz | Reiter |
| Belagerungswerkstatt | 200 Holz, 50 Gold | Ramme, Katapult |
| Turm | 75 Holz, 125 Stein | schießt automatisch Pfeile (Reichweite 8) |
| Palisade | 3 Holz je Segment | billige, schwache Holzmauer |
| Palisadentor | 25 Holz | Tor in der Palisade |
| Steinmauer | 6 Stein je Segment | teure, starke Mauer |
| Steintor | 30 Stein | Tor in der Steinmauer |

## Einheiten

| Einheit | Kosten | Stärken / Schwächen |
|---|---|---|
| Dorfbewohner | 50 Nahrung | sammelt, baut, repariert, jagt |
| Speerkämpfer | 60 Nahrung, 20 Holz | Nahkampf, stark gegen Reiter |
| Bogenschütze | 40 Nahrung, 50 Holz | Fernkampf, stark gegen Speerkämpfer, schwach gegen Reiter |
| Reiter | 100 Nahrung, 20 Holz | schnell, stark gegen Bogenschützen und Belagerung, schwach gegen Speerkämpfer |
| Ramme | 160 Holz, 40 Gold | sehr hoher Schaden nur gegen Gebäude, Mauern und Tore; nahezu immun gegen Pfeile, verwundbar im Nahkampf |
| Katapult | 150 Holz, 150 Gold | Fernkampf (Reichweite 9, Mindestreichweite 3) mit Flächenschaden, gut gegen Gebäude und Mauern, schwach gegen Reiter |

Einheiten greifen Feinde in Sichtweite automatisch an. Pfeile richten an Gebäuden und Mauern kaum Schaden an, Belagerungswaffen sind dafür gebaut.

## Schwierigkeitsgrade

- **Leicht:** langsamere Wirtschaft, späte und kleine Angriffswellen, keine Mauern, Türme oder Belagerung.
- **Mittel:** normale Wirtschaft, Palisaden mit Toren, zwei Türme, Rammen gegen Befestigungen.
- **Schwer:** etwas schnelleres Sammeln (+18 %) und kleiner Startbonus, frühere und größere Wellen, Steinmauern, drei Türme, Rammen und Katapulte.

Die KI spielt nach denselben Regeln und Kosten wie du: Sie baut Häuser rechtzeitig, verteilt Dorfbewohner nach Bedarf, stellt eine gemischte Armee mit Kontern auf, verteidigt ihre Basis und bricht Mauern mit Belagerungswaffen auf oder umgeht sie.
