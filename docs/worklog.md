# Psaníčko – deník

## 31. 10. 2026 noc – napojení na místnost Herny (commit af0bcc3)

- Hotovo: `<meta name="herna-protokol" content="1">`; `#herna=1&m&r&seat&names&zaklada` přeskočí výzvu i setup.
  Sedadlo 0 hraje × jako `names[0]`, sedadlo 1 ○. `zaklada=1` založí dokument `psanicko-<r>/hra` (kdo začíná a sázka 1–6 se losují),
  `zaklada=0` ukazuje „Čeká se, až hra naskočí…“, polluje po 2 s a sám si sedne. Zprávy rodiči: `pripraveno`, `stav` (ceka/hraje/konec),
  `vysledek` (`partie` = `<r>:<číslo hry v sérii>`, `vitez` = sedadlo / null), `jina-hra` z tlačítka „Jiná hra“ na konci.
  V Herně skryté: Nová hra, Odkaz na hru, kopírování odkazu, celá obrazovka, „Vzít tah zpět“ po výhře (aby nešlo vrátit započítaný výsledek).
- Rozhodnuto: pevné sedadlo → strana (0 = ×) místo „volného místa“, ať jméno vždy sedí k sedadlu Herny.
- Ověřeno: `node tests/herna-e2e.cjs` → 15/15, exit 0 (Chromium 1440×900 + WebKit iPhone 13 v iframe náhradního rodiče, mantledb mock;
  pozvaný čeká, oba sednou bez výzvy, 2 partie s odvetou, každé okno 1× `vysledek` na partii, `stav` ceka>hraje>konec>hraje>konec, `jina-hra`).
  Živě `BASE=…/psanicko/ REAL=1 node tests/herna-e2e.cjs` → 15/15, exit 0 (skutečná mantledb). Bez Herny beze změny:
  `tests/solo-e2e.cjs` lokálně i živě 56/56, `tests/solo-bot.cjs` 7/7.
- NEOVĚŘENO: v živé Herně (jen náhradní rodič se stejným protokolem); reálný iPhone.

## 31. 10. 2026 večer – sólo trénink `#solo` (commit ac5f0a7)

- Hotovo: na úvodní obrazovce pod „Založit hru“ sekundární tlačítko „Zkusit sám · trénink proti botovi“, totéž přímo adresou `#solo`.
  Hraješ za ×, bot za ○, táhne po 0,65–1,1 s. První partie: kdo začíná, se losuje; „Znovu“ = začíná poražený, po remíze druhá strana.
- Bot: vyhraje, když může; jinak zablokuje každou pětku soupeře (otevřená, uzavřená i přerušená čtyřka, pak orazítkuje „Ha!“);
  jinak skóruje pole podle pětiposchoďových oken (útok + 0,85 × obrana) a vybírá náhodně z téměř nejlepších → partie se liší.
- Sólo nic neposílá (žádná místnost, žádný zápis do mantledb), nepočítá se do série, v hlavičce „trénink“, pravidla pod deskou v tréninkové verzi,
  vzkazy a razítka k tahu skryté, „Vzít tah zpět“ skryté. Konec: „Znovu“ a „Vyzvat soupeře“ (→ založení výzvy).
- Ověřeno:
  - `node tests/solo-bot.cjs` → unit 7/7, exit 0 (blokace čtyřek, výhra má přednost, bot vs náhodný hráč 30/30, 3 partie bot vs bot se liší).
  - `node tests/solo-e2e.cjs` (lokálně, port 8831, protože 8811 držely Kvízové lodě) → e2e 56/56, exit 0: Chromium 1440×900 i WebKit iPhone 13,
    3 celé partie za sebou, žádný požadavek na mantledb, bez chyb stránky a bez vodorovného scrollu; stávající živá hra (mantledb mockovaný) dál funguje.
  - Živě `BASE=https://sachasportrezervace-arch.github.io/psanicko/ node tests/solo-e2e.cjs` → e2e 56/56, exit 0.
- Opraveno po renderu: tlačítko „Zkusit sám“ přetékalo na iPhonu (odkaz bez `box-sizing`), na konci tréninku visel popisek „zkopíruje zprávu…“.
- NEOVĚŘENO: reálný iPhone (jen WebKit emulace); samostatný design-eye na sólo neběžel (jen vlastní kontrola renderů setup/hra/konec).
