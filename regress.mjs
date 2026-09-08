#!/usr/bin/env node
/*
  Регрессионный прогон модели посадки.

    node regress.mjs            сверить с regress-golden.json
    node regress.mjs --update   перезаписать эталон (осознанно, после проверки диффа)
    node regress.mjs --list     показать значения текущего прогона, без сверки
    node regress.mjs --deploy   что выкладывать на хостинг и всё ли на месте

  Зачем нужен зафиксированный эталон, а не просто прогон «до и после».
  Снимок, снятый с текущего кода, ловит только регрессии внутри одной сессии.
  Ошибка, заехавшая раньше, молча становится частью нового снимка. Золотой файл
  лежит в репозитории и ловит расхождение хоть через месяц.

  Зависимостей нет: model.js и скрипт страницы исполняются в заглушке DOM.
  Сами страницы при этом остаются обычными и открываются с file://.
  Покрыты обе: fit-lab.html (посадка) и index.html (сравнение геометрий).
  Плюс структурная проверка всех страниц: подключены ли общие nav.js и model.js.
*/
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PAGE = join(DIR, 'fit-lab.html');
const MODEL = join(DIR, 'model.js');
const NAV   = join(DIR, 'nav.js');
const GEOM = join(DIR, 'index.html');
const FIXT = join(DIR, 'fixtures-evo.json');
const GOLD = join(DIR, 'regress-golden.json');
const TOL = 1e-6;                       // допуск сравнения, мм и градусы

/* ---------- загрузка модели из страницы ---------- */
function loadModel(page = PAGE, marker = 'function solveFit', expose = null) {
  const html = readFileSync(page, 'utf8');
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const src = blocks.find(b => b.includes(marker));
  if (!src) throw new Error(`в ${page} не нашёлся блок с ${marker}`);

  // минимальная заглушка DOM: модель не должна ничего знать о странице,
  // но render() и построители таблиц пишут в узлы — пусть пишут в объект
  const out = {};
  const stub = {
    style: {}, textContent: '', value: '', checked: false, dataset: {},
    addEventListener() {}, querySelectorAll() { return []; }, appendChild() {},
    after() {}, closest() { return null; }, insertAdjacentHTML() {}, remove() {},
    focus() {}, click() {}, setAttribute() {}, getAttribute() { return null; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  const node = id => ({ ...stub,
    set innerHTML(v) { out[id] = v; },
    get innerHTML() { return out[id] || ''; } });

  // часть глобалей в свежем Node — геттеры без сеттера (navigator), поэтому не присваиваем
  const def = (name, value) => Object.defineProperty(globalThis, name,
    { value, writable: true, configurable: true, enumerable: true });

  def('document', {
    getElementById: node,
    querySelector: () => ({ ...stub, querySelector: () => stub }),
    querySelectorAll: () => [],
    createElement: () => ({ ...stub, querySelector: () => stub }),
    body: { appendChild() {}, removeChild() {}, classList: stub.classList },
    documentElement: { classList: stub.classList, style: {} },
    addEventListener() {},
  });
  def('location', { hash: '', href: 'file:///x', pathname: '/x', search: '' });
  def('history', { replaceState() {} });
  def('window', { addEventListener() {}, isSecureContext: false,
    matchMedia: () => ({ matches: false, addEventListener() {} }), location: globalThis.location });
  def('navigator', {});
  def('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  def('requestAnimationFrame', f => f());
  def('FileReader', function () {});
  def('Blob', function () {});
  def('URL', { createObjectURL: () => '' });
  def('alert', () => {});

  // общая модель подключается страницей как <script src>, поэтому в песочнице
  // её нужно выполнить первой — иначе BikeModel не существует
  (0, eval)(readFileSync(MODEL, 'utf8'));

  const tail = expose || ('\nglobalThis.__M = {state, solveFit, solveStand, solveFrame, solveCockpit,'
               + ' segments, elbow3D, buildTable, buildStandTable, buildSummary, buildWarns,'
               + ' cockpitEnvelope, CK_CATALOG, RAAD_SECTORS,'
               + ' HK, PS_FITKEYS, fixReq};');
  (0, eval)(src + tail);
  return { ...globalThis.__M, out };
}

/* ---------- набор кейсов ---------- */
/* Реальные связки: рама + её кокпит. Тело одно — EVO.
   Hagen сюда не входит: его геометрия со 130-й вилкой не сходится сама с собой,
   а держать в эталоне числа, про которые известно, что они неверны, — вредно. */
const SETUPS = [
  ['Speedone Floater L 120',     'Floater 120'],
  ['Outleap Warhog L 2025 140',  'WARHOG'],
];
/* Сетка вокруг каждой связки. Значения подобраны так, чтобы задеть все ветки:
   sag 0 — паспортная геометрия, 25 — рабочая; наклон байка — обе ветки стойки
   (отрыв и спуск) плюс ровная; разведение — от прижатых локтей до предела. */
const SAGS   = [0, 25];
const TORSOS = [48, 56];
const FLARES = [0, 30, 60];
const PITCH  = [-30, 0, 30];

/* Что именно сверяем. Осознанно широкий срез: числа кокпита, посадки, стойки,
   развесовки и производные, по которым видно поворот руля и проекцию локтя. */
const KEYS_FIT = ['satH','satStraight','setback','effReach','effStack','dReach','dStack',
  'rad','raad','radTarget','radDelta','s2gX','s2gZ','gripW',
  'kneeBDC','kneeTDC','hipTDC','elbow','elbowProj','elbowOut','abduction',
  'armUse','armD3','shExtUsed','splay','forearmPlan','sweepPlan','wristDev','frontPct'];
const KEYS_ST  = ['torso','elbow','elbowProj','elbowOut','abduction','kneeF','kneeR',
  'hipBack','clear','frontPct'];

function applyPreset(X, P, geoName, ckName, bodyName) {
  const s = X.state, g = P.geo[geoName], c = P.ck[ckName], b = P.body[bodyName];
  if (!g) throw new Error('нет геометрии: ' + geoName);
  if (!c) throw new Error('нет кокпита: ' + ckName);
  if (!b) throw new Error('нет тела: ' + bodyName);
  X.HK.bike.forEach(k => s.bike[k] = g[k]);
  s.bike.name = geoName;
  if (g.wheelR) s.wheelR = g.wheelR;
  X.HK.ck.forEach(k => s.ck[k] = c[k]);
  X.PS_FITKEYS.ck.forEach(k => s.fit[k] = c[k]);
  X.HK.body.forEach(k => s.body[k] = b[k]);
  X.PS_FITKEYS.body.forEach(k => s.fit[k] = b[k]);
  X.fixReq();
}

const r4 = v => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(4) : v;

function run() {
  const X = loadModel();
  const P = JSON.parse(readFileSync(FIXT, 'utf8'));
  const rows = {};
  for (const [geo, ck] of SETUPS)
    for (const sag of SAGS)
      for (const torso of TORSOS)
        for (const flare of FLARES)
          for (const pitch of PITCH) {
            applyPreset(X, P, geo, ck, 'EVO');
            X.state.bike.sag = sag;
            X.state.fit.torso = torso;
            X.state.fit.elbowFlare = flare;
            X.state.fit.bikePitch = pitch;
            const M = X.solveFit();
            const ST = X.solveStand(M);
            const id = `${geo}|sag${sag}|torso${torso}|flare${flare}|pitch${pitch}`;
            const o = {};
            KEYS_FIT.forEach(k => o[k] = r4(M[k]));
            KEYS_ST.forEach(k => o['st.' + k] = r4(ST[k]));
            // ориентация руля — она же ловит доворот под sag
            const C = M.CO;
            const gx = [C.barEnd[0] - C.barBend[0], C.barEnd[1] - C.barBend[1], C.barEnd[2] - C.barBend[2]];
            o['co.elev']     = r4(C.elev);
            o['co.gripX']    = r4(C.grip[0]);
            o['co.gripY']    = r4(C.grip[1]);
            o['co.gripZ']    = r4(C.grip[2]);
            o['co.axSweep']  = r4(180 / Math.PI * Math.atan2(-gx[0], gx[1]));
            o['co.axUp']     = r4(180 / Math.PI * Math.asin(gx[2] / Math.hypot(...gx)));
            o['frame.pitchSag'] = r4(M.F.pitchSag);
            o['frame.hta']      = r4(M.F.hta);
            if (M.load) { o['load.hPct'] = r4(M.load.hPct); o['load.Fh'] = r4(M.load.Fh); }
            // нефинитные значения — сами по себе ошибка
            for (const [k, v] of Object.entries(o))
              if (typeof v === 'number' && !isFinite(v)) o[k] = 'НЕ ЧИСЛО';
            rows[id] = o;
          }
  return rows;
}

/* ---------- конверт кокпита ----------
   Числа посадки этот блок не дублирует: он сторожит перебор, отбор
   представителей и вердикт — то, чего в сетке выше нет вовсе. Рамы подобраны
   по веткам вердикта, а не по реалистичности: Hagen 5 XL и Torque на этом росте
   заведомо велики, Radius S при росте 200 заведомо мал, «Floater 140 Old» —
   кокпит с 55 мм проставок и загибом 5°, то есть вне рабочих диапазонов. */
const ENV_CASES = [
  ['Speedone Floater L 120',       'Floater 120',    0,  null],
  ['Outleap Warhog L 2025 140',    'WARHOG',         0,  null],
  ['Outleap Warhog L 2025 140',    'WARHOG',        25,  null],   // RAD обязан не измениться, RAAD — обязан
  ['Canyon Exeed L Cross-country', 'WARHOG',         0,  null],
  ['Hagen 5 XL Cross-country',     'WARHOG',         0,  null],   // ветка «рама велика»
  ['Canyon Torque L Downhill',     'WARHOG',         0,  null],   // она же на другой геометрии
  ['Outleap Radius S 27,5',        'WARHOG',         0,  null],
  ['Outleap Radius S 27,5',        'WARHOG',         0,  2000],   // ветка «рама мала»
  ['Speedone Floater L 120',       'Floater 140 Old',0,  null],   // кокпит вне каталога
];

function runEnv() {
  const X = loadModel();
  const P = JSON.parse(readFileSync(FIXT, 'utf8'));
  const rows = {};
  for (const [geo, ck, sag, height] of ENV_CASES) {
    applyPreset(X, P, geo, ck, 'EVO');
    X.state.bike.sag = sag;
    if (height) X.state.body.height = height;
    const E = X.cockpitEnvelope({ sag });
    const o = {};
    o['env.n']       = E.envelope.n;
    o['env.radMin']  = r4(E.envelope.radMin);
    o['env.radMax']  = r4(E.envelope.radMax);
    o['env.raadMin'] = r4(E.envelope.raadMin);
    o['env.raadMax'] = r4(E.envelope.raadMax);
    o['v.code']      = E.verdict.code;
    o['v.target']    = r4(E.verdict.target);
    o['v.inTarget']  = E.verdict.inTarget;
    o['v.raadMin']   = r4(E.verdict.raadMin);
    o['v.raadMax']   = r4(E.verdict.raadMax);
    o['v.text']      = E.verdict.text;
    o['v.needReach']  = E.verdict.advice ? r4(E.verdict.advice.reach) : '—';
    for (const s of E.sectors) {
      o[`s.${s.key}.n`] = s.n;
      const p = s.picks[0];
      if (!p) continue;
      o[`s.${s.key}.cfg`]    = p.label;
      o[`s.${s.key}.rad`]    = r4(p.rad);
      o[`s.${s.key}.raad`]   = r4(p.raad);
      o[`s.${s.key}.lvl`]    = p.body.level;
      /* Наклон корпуса сидя — теперь ВЫХОД инверсии, и это главное число блока:
         оно и сторожит, что критерий решается, а не наследуется от слайдера. */
      o[`s.${s.key}.torsoSit`]   = r4(p.body.torso);
      o[`s.${s.key}.arm`]    = r4(p.body.armUse);
      o[`s.${s.key}.wrist`]  = r4(p.body.wristDev);
      o[`s.${s.key}.hands`]  = p.body.hPct==null ? '—' : r4(p.body.hPct);
      o[`s.${s.key}.torsoStand`] = r4(p.body.torsoStand);
      o[`s.${s.key}.reach`]  = p.body.reach || '—';
    }
    const C = E.current;
    o['cur.rad']      = r4(C.rad);
    o['cur.raad']     = r4(C.raad);
    o['cur.radDelta'] = r4(C.radDelta);
    o['cur.sector']   = C.sector;
    o['cur.inTarget'] = C.inTarget;
    o['cur.rollEff']  = r4(C.rollEffect);
    o['cur.lvl']      = C.body.level;
    o['cur.torsoSit']   = r4(C.body.torso);
    o['cur.arm']      = r4(C.body.armUse);
    o['cur.wrist']    = r4(C.body.wristDev);
    o['cur.torsoStand'] = r4(C.body.torsoStand);
    o['cur.off']      = C.offCatalog.join(' | ') || '—';
    o['cur.near']     = C.nearest ? C.nearest.label : '—';
    for (const [k, v] of Object.entries(o))
      if (typeof v === 'number' && !isFinite(v)) o[k] = 'НЕ ЧИСЛО';
    rows[`env|${geo}|${ck}|sag${sag}${height ? '|рост' + height : ''}`] = o;
  }
  /* Сторож главного свойства: конверт не должен зависеть от позы. Гоняем один
     кейс на трёх разных наклонах корпуса и углах стойки и требуем совпадения
     байт в байт. Именно это свойство было сломано в первой версии карточки. */
  applyPreset(X, P, 'Outleap Warhog L 2025 140', 'WARHOG', 'EVO');
  X.state.bike.sag = 0;
  const snap = [];
  for (const [torso, knee, elbow] of [[45, 130, 120], [58, 140, 130], [70, 155, 150]]) {
    X.state.fit.torso = torso; X.state.fit.kneeStand = knee; X.state.fit.elbowStand = elbow;
    const E = X.cockpitEnvelope({ sag: 0 });
    snap.push([r4(E.envelope.radMin), r4(E.verdict.raadMin), E.verdict.inTarget,
               r4(E.current.body.torso), r4(E.current.body.wristDev), E.verdict.text.length].join('|'));
  }
  rows['env|поза не влияет на конверт'] = {
    'поза45': snap[0], 'поза58': snap[1], 'поза70': snap[2],
    'все три совпали': snap[0] === snap[1] && snap[1] === snap[2] ? 'да' : 'НЕТ',
  };
  return rows;
}

/* ---------- страница сравнения геометрий ----------
   У index.html свой солвер рамы, написанный независимо от fit-lab: та же физика,
   другой стиль. Пока числа совпадают, но покрыть надо обе копии — иначе правка
   в одной молча разойдётся со второй. Это временно: после выноса общей модели
   останется один солвер, а этот блок продолжит сторожить страницу целиком. */
const KEYS_GEO = ['hta','sta','reach','stack','bbDrop','wb','bbH','trail','ett','fc','cs',
                  'a2cRef','a2cNew','offset','offsetRef','forkAxRef','dA2C','sagMM','theta'];

function runGeom() {
  const X = loadModel(GEOM, 'function solve(', '\nglobalThis.__M = {state, solve};');
  const P = JSON.parse(readFileSync(FIXT, 'utf8'));
  const rows = {};
  /* Все геометрии фикстуры, у которых задана база, на паспортном ходе и под sag,
     плюс отдельно замена вилки: удлинение и смена офсета. */
  const names = Object.keys(P.geo).filter(n => P.geo[n].wb);
  for (const n of names) {
    const g = P.geo[n];
    for (const [tag, over] of [
      ['паспорт',   { sag: 0 }],
      ['sag25',     { sag: 25 }],
      ['ход+20',    { sag: 25, travel: g.travelRef + 20 }],
      ['вилка+55/40', { sag: 25, forkA2C: 520, forkA2Cnew: 575, forkOffsetNew: 40 }],
    ]) {
      X.state.wheelR = g.wheelR || 368;
      const b = { ...g, ...over };
      const r = X.solve(b);
      const o = {};
      KEYS_GEO.forEach(k => o[k] = r4(r[k]));
      for (const [k, v] of Object.entries(o))
        if (typeof v === 'number' && !isFinite(v)) o[k] = 'НЕ ЧИСЛО';
      rows[`geo|${n}|${tag}`] = o;
    }
  }
  return rows;
}

/* ---------- сравнение ---------- */
function diff(gold, cur) {
  const problems = [];
  const gk = Object.keys(gold), ck = Object.keys(cur);
  gk.filter(k => !ck.includes(k)).forEach(k => problems.push({ id: k, key: '—', was: 'кейс есть', now: 'кейс пропал' }));
  ck.filter(k => !gk.includes(k)).forEach(k => problems.push({ id: k, key: '—', was: 'кейса не было', now: 'новый кейс' }));
  for (const id of gk.filter(k => ck.includes(k))) {
    const a = gold[id], b = cur[id];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const x = a[k], y = b[k];
      if (typeof x === 'number' && typeof y === 'number') {
        if (Math.abs(x - y) > TOL) problems.push({ id, key: k, was: x, now: y, d: y - x });
      } else if (x !== y) problems.push({ id, key: k, was: x, now: y });
    }
  }
  return problems;
}

/* ---------- структурная проверка страниц ----------
   Числа она не считает: ловит то, что регресс поймать не может — забытое
   подключение общего файла на новой странице. Такая ошибка не роняет расчёт,
   просто у страницы молча пропадает шапка, стили или солвер. */
function checkPages() {
  const bad = [];
  const pages = readdirSync(DIR).filter(f => f.endsWith('.html'));

  for (const f of pages) {
    const html = readFileSync(join(DIR, f), 'utf8');
    const n = (html.match(/<script src="nav\.js"><\/script>/g) || []).length;
    if (n !== 1) bad.push(`${f}: подключений nav.js ${n}, а должно быть одно`);
    if (/<nav class="nav">/.test(html)) bad.push(`${f}: осталась разметка шапки — её рисует nav.js`);
    if (!/<link rel="stylesheet" href="site\.css">/.test(html))
      bad.push(`${f}: не подключён site.css — не будет ни палитры, ни шапки`);
    if (/\.nav a\{/.test(html)) bad.push(`${f}: стили шапки задублированы, они в site.css`);
    if (/\.toolbar\{|\.psbox\{/.test(html) && !/<link rel="stylesheet" href="tools\.css">/.test(html))
      bad.push(`${f}: виджеты инструмента без tools.css`);
    // страница с оглавлением — читаемая, её каркас и типографика в read.css
    if (/class="card toc"/.test(html) && !/<link rel="stylesheet" href="read\.css">/.test(html))
      bad.push(`${f}: есть оглавление, но нет read.css — раскладка и текст разъедутся`);
    if (/\.toc a\{|^\s*\.lead\{/m.test(html))
      bad.push(`${f}: стили оглавления или лида задублированы, они в read.css`);
    // блок проверки вилки обязан рисоваться общей функцией: свои .warn у страниц
    // разные, и собранная на месте разметка на них наезжала
    if (/FORKCHK\s*=/.test(html) && !/forkReportHTML/.test(html))
      bad.push(`${f}: блок проверки вилки собирается на месте, а должен звать BikeModel.forkReportHTML`);
    if (/BikeModel/.test(html) && !/<script src="model\.js"><\/script>/.test(html))
      bad.push(`${f}: зовёт BikeModel, но не подключает model.js`);
    /* Заголовок карточки результатов — это ручка сворачивания. Карточка без него
       не свернётся и молча останется всегда раскрытой; поймать это числами
       нельзя, расчёт от заголовка не зависит. */
    const main = /collapseInit\(\)/.test(html) && html.match(/<main class="results">([\s\S]*?)<\/main>/);
    if (main) {
      /* Класс матчится по границе токена: рядом живёт .cardsbar, и шаблон
         "card[^"]*" считал бы панель режима десятой карточкой. */
      const cards = (main[1].match(/<div class="card[" ]/g) || []).length;
      const heads = (main[1].match(/<h3[ >]/g) || []).length;
      if (heads < cards) bad.push(`${f}: карточек результатов ${cards}, а заголовков ${heads} — карточка без заголовка не сворачивается`);
      /* id карточки — ключ, под которым запоминается, раскрыта она или нет.
         Без id состояние карточки молча не сохранится. */
      const ided = (main[1].match(/<div class="card(?:"|[^"]*") id="/g) || []).length;
      if (ided < cards) bad.push(`${f}: карточек результатов ${cards}, а с id ${ided} — состояние карточки без id не запоминается`);
    }
  }

  // nav.js исполняется по-настоящему: для каждой страницы ровно одна ссылка
  // должна быть помечена текущей, и все ссылки должны вести на живые файлы
  const src = readFileSync(NAV, 'utf8');
  const render = path => {
    let out = '';
    const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
    def('location', { pathname: path });
    def('document', { currentScript: { insertAdjacentHTML: (_, h) => out = h }, write: h => out = h });
    (0, eval)(src);
    return out;
  };
  const first = render('/index.html');
  let outward = 0;
  for (const href of [...first.matchAll(/href="([^"]+)"/g)].map(m => m[1])) {
    // ссылка наружу — на сайт автора; проверяем только что она абсолютная и по https
    if (/^https?:\/\//.test(href)) {
      outward++;
      if (!href.startsWith('https://')) bad.push(`nav.js: внешняя ссылка ${href} не по https`);
      continue;
    }
    if (!pages.includes(href)) bad.push(`nav.js: ссылка на ${href}, а такого файла нет`);
  }
  if (outward !== 1) bad.push(`nav.js: ссылок наружу ${outward}, а должна быть одна — на сайт автора`);
  for (const f of pages) {
    const h = render('/' + f);
    const cur = [...h.matchAll(/href="([^"]+)" aria-current/g)].map(m => m[1]);
    if (cur.length !== 1) bad.push(`nav.js на ${f}: помечено текущими ${cur.length} ссылок вместо одной`);
    // внешняя ссылка не должна притворяться текущим разделом ни на одной странице
    if (/href="https?:[^"]*" aria-current/.test(h)) bad.push(`nav.js на ${f}: внешняя ссылка помечена как текущий раздел`);
    if (!/class="nhome"/.test(h)) bad.push(`nav.js на ${f}: пропала ссылка на сайт автора`);
  }
  // GitHub Pages отдаёт индекс без имени файла — этот путь тоже должен работать
  if (!/href="index\.html" aria-current/.test(render('/bike-geometry-lab/')))
    bad.push('nav.js: на корневом адресе не подсвечен индекс');

  const D = deployList();
  D.missing.forEach(x => bad.push(x));
  D.leaks.forEach(x => bad.push(x));

  return { bad, nPages: pages.length };
}

/* ---------- что выкладывать на хостинг ----------
   Список не написан руками, а выводится из самих страниц: берём все локальные
   ссылки из src= и href=, добавляем сами страницы. Забыть новый общий файл
   таким способом нельзя. Заодно ловим ссылки в никуда и файлы с личными
   данными, которым на публичном сервере делать нечего. */
const PRIVATE = ['fixtures-evo.json', 'bikefit_evgeny_reference.md', 'regress-golden.json'];

function deployList() {
  const pages = readdirSync(DIR).filter(f => f.endsWith('.html'));
  const need = new Set(pages), missing = [], leaks = [];
  for (const f of pages) {
    const html = readFileSync(join(DIR, f), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      let r = m[1];
      if (/^(https?:)?\/\/|^mailto:|^data:|^#/.test(r)) continue;
      if (r.includes('${')) continue;              // шаблонная строка, не файл
      r = r.split('#')[0].split('?')[0];
      if (!r) continue;
      if (!existsSync(join(DIR, r))) missing.push(`${f} ссылается на ${r}, а файла нет`);
      else need.add(r);
      if (PRIVATE.includes(r)) leaks.push(`${f} тянет ${r} — это личные данные, на сервер нельзя`);
    }
  }
  return { files: [...need].sort(), missing, leaks, pages: pages.length };
}

/* ---------- запуск ---------- */
const arg = process.argv[2] || '';

const S = checkPages();
if (S.bad.length) {
  console.log(`структура страниц — проблем ${S.bad.length}:`);
  S.bad.forEach(x => console.log('  ' + x));
  process.exit(1);
}

const cur = { ...run(), ...runEnv(), ...runGeom() };
const nCases = Object.keys(cur).length;
const nVals = Object.values(cur).reduce((t, o) => t + Object.keys(o).length, 0);

if (arg === '--deploy') {
  const D = deployList();
  if (D.missing.length || D.leaks.length) {
    [...D.missing, ...D.leaks].forEach(x => console.log('  ' + x));
    process.exit(1);
  }
  console.log(`выкладывать на хостинг (${D.files.length} файлов, ${D.pages} страниц):\n`);
  D.files.forEach(f => console.log('  ' + f));
  const rest = readdirSync(DIR).filter(f => !D.files.includes(f) && !f.startsWith('.'));
  console.log(`\nостальное на сервер не нужно: ${rest.join(', ')}`);
  console.log('\nfixtures-evo.json и bikefit_evgeny_reference.md — личные замеры, их не выкладывать.');
  process.exit(0);
}
if (arg === '--list') {
  console.log(JSON.stringify(cur, null, 1));
  process.exit(0);
}
if (arg === '--update') {
  writeFileSync(GOLD, JSON.stringify(cur, null, 1) + '\n');
  console.log(`эталон перезаписан: ${nCases} кейсов, ${nVals} значений -> regress-golden.json`);
  process.exit(0);
}

let gold;
try { gold = JSON.parse(readFileSync(GOLD, 'utf8')); }
catch { console.error('нет regress-golden.json — сними эталон: node regress.mjs --update'); process.exit(2); }

const bad = diff(gold, cur);
const nonFinite = Object.entries(cur).flatMap(([id, o]) =>
  Object.entries(o).filter(([, v]) => v === 'НЕ ЧИСЛО').map(([k]) => id + ' / ' + k));

if (!bad.length && !nonFinite.length) {
  console.log(`регресс чист: ${nCases} кейсов, ${nVals} значений, допуск ${TOL}`);
  console.log(`структура: ${S.nPages} страниц, общие стили и скрипты на месте`);
  process.exit(0);
}
if (nonFinite.length) {
  console.log(`НЕ ЧИСЛО в ${nonFinite.length} значениях:`);
  nonFinite.slice(0, 20).forEach(x => console.log('  ' + x));
}
if (bad.length) {
  const byKey = {};
  bad.forEach(p => { (byKey[p.key] ||= []).push(p); });
  console.log(`\nрасхождений: ${bad.length} в ${Object.keys(byKey).length} параметрах (из ${nVals} значений)\n`);
  Object.entries(byKey)
    .sort((a, b2) => Math.max(...b2[1].map(p => Math.abs(p.d || 0))) - Math.max(...a[1].map(p => Math.abs(p.d || 0))))
    .forEach(([k, ps]) => {
      const mx = Math.max(...ps.map(p => Math.abs(p.d || 0)));
      console.log(`  ${k.padEnd(18)} ${String(ps.length).padStart(3)} кейсов | макс Δ ${mx.toFixed(4)}`);
      console.log(`      напр. ${ps[0].id}\n            было ${ps[0].was} -> стало ${ps[0].now}`);
    });
  console.log('\nЕсли изменения ожидаемые — посмотри дифф выше и зафиксируй: node regress.mjs --update');
}
process.exit(1);
