/*
  Каталог рам: просмотр, фильтры, добавление к себе в пресеты и статус уже
  добавленных. Данные — catalog-data.js, хранилище — presets.js.

  Статус добавленной рамы держится на снимке. Добавляя раму, кладём в блоб
  пресетов служебную запись catalog.geo[имя пресета] = {id, snap}: id записи
  каталога и её поля на момент добавления. Дальше три числа сравниваются
  попарно: пресет против снимка — это правки владельца, каталог против снимка —
  правки в каталоге. Хэш вместо снимка сказал бы только «что-то поменялось»;
  снимок говорит что именно — «reach 465 → 468», — а это и нужно, чтобы решить,
  брать правку или нет.

  Рама, которая была у человека до каталога (у владельца — все, каталог из них
  и собран), записи не имеет. Её узнаём по совпадению геометрии и показываем
  как «есть у тебя» с именем пресета, а кнопка «Связать с каталогом» пишет
  связь явно — дальше правки каталога видны и для неё. Молча связывать при
  просмотре не стали: открытие окна не должно менять хранилище.

  Кнопки «→ Рама 1», «→ Рама 2» (сравнение) и «Открыть в Fit Lab» показывают
  раму на странице, не добавляя её в пресеты: посмотреть, прежде чем брать.
  Слоты и подписи задаёт страница в BikePresets.init (showSlots), окно они
  не закрывают — можно поставить рамы в оба слота подряд. Кнопка помнит, что
  слот уже показывает эту раму: это выясняется по геометрии слота, а не по
  запомненному клику — человек мог поменять раму после.

  Сравниваются только поля рамы и паспорта модели. Ход, sag, поправка угла
  рулевой и замена вилки — настройка райдера: сохранил раму с sag 25 — это не правка рамы.

  Классический скрипт, не модуль: с file:// модули не грузятся. Подключается
  после catalog-data.js, frame.js и presets.js.
*/
(function (global) {
  'use strict';

  const FRAME = ['reach', 'stack', 'hta', 'sta', 'ht', 'st', 'cs', 'bbDrop', 'wb', 'offset', 'travelRef', 'rigid', 'wheelR', 'forkOffsetSpec'];
  const META = ['brand', 'model', 'year', 'size', 'use'];
  const CMP = [...FRAME, ...META];
  const ENTRIES = global.BikeCatalogData || [];

  const P = () => global.BikePresets, F = () => global.BikeFrame;
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const norm = v => v === undefined || v === '' ? null : v;
  // числа сравниваем с допуском: 65.8 из файла и 65.8 из поля ввода — одно число
  const eq = (a, b) => { a = norm(a); b = norm(b);
    return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b; };
  const byId = id => ENTRIES.find(e => e.id === id) || null;

  /* Отличия b от a по списку ключей: [ключ, было, стало]. */
  const diff = (a, b, keys) => keys.filter(k => !eq(a[k], b[k])).map(k => [k, norm(a[k]), norm(b[k])]);
  const snap = e => Object.fromEntries(CMP.map(k => [k, norm(view(e)[k])]));

  /* Запись каталога -> пресет рамы. Ход паспортный, sag 0: так рама совпадает
     с таблицей производителя, а посадку человек настроит сам. У жёсткой вилки
     хода в каталоге нет, и модели он не нужен; 100 ставим, чтобы слайдеры не
     остались пустыми, если человек снимет галочку. Под галочкой их не видно. */
  /* Запись такой, какой она ляжет в пресет. Снимок, сравнение и «есть у тебя»
     идут по ней, а не по сырой записи: иначе подставленный ход 100 у жёсткой
     вилки выглядел бы правкой владельца сразу после добавления. */
  const view = e => e.rigid && e.travelRef == null ? { ...e, travelRef: 100 } : e;
  const toPreset = e => { const v = view(e); return P().pick('geo', { ...v, travel: v.travelRef, sag: 0 }); };

  /* «Та же рама» для узнавания «есть у тебя» и «Связать»: по геометрии, а не по
     всем полям. Рама, введённая руками, отличается служебным: проверочный офсет
     вилки (forkOffsetSpec) человек не заполняет, радиус колеса и паспортный ход
     ставит свои, числа округляет (stack 621 вместо 621.3). Сравнивать всё до
     последнего знака значило не узнать свою же раму (так и вышло 2026-10-01 после
     приведения записей к таблицам). Допуск — 1 мм и 0.2°: разные размеры одной
     модели различаются на 10–20 мм, так что за ту же раму принять другую нельзя.
     Точное сравнение по CMP остаётся для связанных рам — там нужны именно правки.
     Положение оси: база, если есть у обеих; иначе офсет; иначе база из модели. */
  const GEO = ['reach', 'stack', 'hta', 'sta', 'ht', 'st', 'cs', 'bbDrop'], ANGLE = ['hta', 'sta'];
  const near = (k, a, b) => { a = norm(a); b = norm(b);
    return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (ANGLE.includes(k) ? 0.2 : 1); };
  const derivedWB = x => { try { return global.BikeModel.solveFrame({ ...x, travel: x.travelRef || 100, sag: 0, dHta: 0 }, x.wheelR || 368).wb; } catch (err) { return null; } };
  const frontNear = (a, b) => norm(a.wb) != null && norm(b.wb) != null ? near('wb', a.wb, b.wb)
    : norm(a.offset) != null && norm(b.offset) != null ? near('offset', a.offset, b.offset)
    : near('wb', derivedWB(a), derivedWB(b));
  const sameFrame = (a, b) => GEO.every(k => near(k, a[k], b[k])) && frontNear(a, b);

  /* Все рамы человека по имени: свои и встроенные страницы, как в списке пресетов. */
  function myFrames() {
    const L = P().listing('geo');
    return [...L.pinned, ...L.rest].map(n => [n, P().find('geo', n)]).filter(x => x[1]);
  }
  const links = o => (o.catalog && o.catalog.geo) || {};

  /*
    Статус записи каталога для этого хранилища:
      none     — у человека её нет
      same     — добавлена, не менялась ни там, ни там
      catalog  — добавлена, в каталоге правки (cat — какие)
      mine     — добавлена, правки у владельца (mine — какие)
      both     — и то и другое
      match    — добавлена до каталога или руками: геометрия совпала с пресетом
                 (sameFrame: с допуском на округление, без радиуса, хода и проверочного офсета)
    name — имя пресета (у match — первое из совпавших, names — все).
  */
  function status(e) {
    const o = P().store.read(), L = links(o);
    const linked = Object.keys(L).filter(n => L[n] && L[n].id === e.id && P().find('geo', n)).sort();
    if (linked.length) {
      const name = linked[0], rec = L[name], cur = P().find('geo', name);
      // снимок тоже через view: связи, записанные до 2026-09-29 (вечер), хранят жёсткую вилку без хода
      const sv = rec.snap ? view(rec.snap) : {};
      const cat = diff(sv, view(e), CMP), mine = diff(sv, cur, CMP);
      const state = cat.length && mine.length ? 'both' : cat.length ? 'catalog' : mine.length ? 'mine' : 'same';
      return { state, name, cat, mine };
    }
    const names = myFrames().filter(([, d]) => sameFrame(d, view(e))).map(([n]) => n);
    return names.length ? { state: 'match', name: names[0], names } : { state: 'none' };
  }

  /* Под каким именем добавить: имя каталога, а если оно занято другой рамой —
     с пометкой «(каталог)». Чужой пресет с тем же именем не перезаписываем. */
  function freeName(name) {
    if (!P().find('geo', name)) return name;
    for (let i = 1; i < 100; i++) {
      const n = i === 1 ? `${name} (каталог)` : `${name} (каталог ${i})`;
      if (!P().find('geo', n)) return n;
    }
    return null;
  }

  function writeLink(o, name, e) {
    const c = o.catalog = o.catalog && typeof o.catalog === 'object' ? o.catalog : {};
    const g = c.geo = c.geo && typeof c.geo === 'object' ? c.geo : {};
    g[name] = { id: e.id, snap: snap(e) };
  }

  /* Добавить записи по id. Уже добавленные и совпавшие пропускаются. Добавленные
     закрепляются вверху списка: человек выбрал их сам и сейчас будет искать.
     Вернёт имена новых пресетов. */
  function add(ids) {
    const done = [];
    ids.forEach(id => {
      const e = byId(id); if (!e) return;
      if (status(e).state !== 'none') return;
      const name = freeName(e.name); if (!name) return;
      const o = P().store.read();
      (o.geo = o.geo || {})[name] = toPreset(e);
      writeLink(o, name, e);
      const pins = (o.pinned = o.pinned || {}); (pins.geo = pins.geo || {})[name] = true;
      if (P().store.write(o)) done.push(name);
    });
    return done;
  }

  /* Взять раму из каталога поверх пресета: поля рамы и паспорта — каталожные,
     ход, sag и замена вилки остаются как у человека. Снимок — нынешний каталог. */
  function take(id) {
    const e = byId(id), s = e && status(e);
    if (!s || !['catalog', 'mine', 'both'].includes(s.state)) return false;
    const o = P().store.read(), cur = { ...(P().find('geo', s.name) || {}) };
    const fresh = toPreset(e);
    CMP.forEach(k => cur[k] = fresh[k]);
    (o.geo = o.geo || {})[s.name] = P().pick('geo', cur);
    writeLink(o, s.name, e);
    return P().store.write(o) ? s.name : false;
  }

  /* Связать свой пресет с записью каталога. Только если геометрия совпадает —
     иначе снимок сразу соврал бы, что рама добавлена как есть. Пустые поля
     паспорта модели заполняются из каталога: пресет, введённый до паспорта,
     иначе сразу показал бы «есть твои правки» (бренд: — → Hagen). Заполненные
     не трогаем — расхождение с каталогом честно покажется правкой. */
  function link(id, name) {
    const e = byId(id), cur = e && P().find('geo', name);
    if (!cur || !sameFrame(cur, view(e))) return false;
    const o = P().store.read();
    const empty = META.filter(k => norm(cur[k]) == null && norm(e[k]) != null);
    if (empty.length) {
      const d = { ...cur }; empty.forEach(k => d[k] = e[k]);
      (o.geo = o.geo || {})[name] = P().pick('geo', d);
    }
    writeLink(o, name, e);
    return P().store.write(o) ? name : false;
  }

  /* Показать раму каталога в слоте страницы. Ничего не пишет в хранилище: ни
     пресета, ни связи с каталогом. Ход паспортный, sag 0 — как при добавлении. */
  function show(id, slot) {
    const e = byId(id); if (!e) return false;
    return P().show('geo', slot, toPreset(e), e.name);
  }

  /* Что сейчас лежит в слотах страницы, для подсветки кнопок. Считается один
     раз на перерисовку: строк сотни, а слотов два. Колесо сверяем, только если
     оно есть в записи: без него страница подставляет своё, и это не расхождение. */
  const slotState = () => P().showSlots().map(([, slot]) => P().current('geo', slot));
  const shownIn = (e, cur) => !!cur && !diff(cur, view(e), norm(e.wheelR) == null ? FRAME.filter(k => k !== 'wheelR') : FRAME).length;

  /* ---------- фильтры ---------- */

  const FILTERS = [
    ['brand', 'Бренд'], ['use', 'Назначение'], ['year', 'Год'], ['size', 'Размер']
  ];
  const filt = { brand: '', use: '', year: '', size: '' };
  const pickedIds = new Set();
  const openDiff = new Set();

  // размеры по-человечески: XS < S < M < ML < L < XL, числа по величине, прочее в конце
  const SIZE_ORDER = ['XXS', 'XS', 'S', 'SM', 'S/M', 'M', 'ML', 'M/L', 'L', 'LXL', 'L/XL', 'XL', 'XXL'];
  /* Фильтр размера — по буквенной группе, иначе «S», «S/52» у шоссейных и
     «Short» у Merida стоят тремя пунктами. Short…XLong у Merida — это длина
     рамы, а не размер, но по reach они ложатся ровно на S…XL. В имени рамы
     остаётся размер, как его пишет производитель. */
  const LONG = { SHORT: 'S', MID: 'M', LONG: 'L', XLONG: 'XL' };
  // «27.5 S», «29 M» у Outleap — колесо впереди размера: в группе S, M
  const sizeGroup = s => { const k = String(s).toUpperCase().split('/')[0].replace(/^(26|27\.5|29) /, '').trim();
    return LONG[k] || (SIZE_ORDER.includes(k) ? k : String(s)); };
  const sizeRank = s => { const i = SIZE_ORDER.indexOf(sizeGroup(s)); if (i >= 0) return i;
    const n = parseFloat(s); return isFinite(n) ? 100 + n : 1000; };
  /* Значения фильтра k — только те, под которые при остальных выбранных
     фильтрах найдётся хоть одна рама: выбрал Hagen — в назначении нет шоссе.
     Выбранное значение остаётся в списке, даже если стало пустым, иначе его
     нельзя было бы увидеть и сбросить. */
  const values = k => {
    const rest = { ...filt, [k]: '' };
    const pool = filtered(rest);
    const vs = [...new Set(pool.map(e => k === 'size' && e.size != null ? sizeGroup(e.size) : e[k]).filter(v => v != null && v !== ''))];
    if (filt[k] !== '' && !vs.some(v => String(v) === String(filt[k]))) vs.push(k === 'year' ? +filt[k] : filt[k]);
    if (k === 'year') return vs.sort((a, b) => b - a);
    if (k === 'size') return vs.sort((a, b) => sizeRank(a) - sizeRank(b) || String(a).localeCompare(String(b)));
    if (k === 'use') return F().USES.map(u => u[0]).filter(u => vs.includes(u));
    return vs.sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  };
  const valLabel = (k, v) => k === 'use' ? F().useLabel(v) : String(v);

  function filtered(f) {
    f = f || filt;
    return ENTRIES.filter(e => FILTERS.every(([k]) => f[k] === ''
      || String(k === 'size' ? sizeGroup(e.size) : e[k]) === String(f[k])));
  }

  /* ---------- разметка ---------- */

  const STATUS = {
    none: null,
    same: ['ok', 'добавлена'],
    match: ['ok', 'есть у тебя'],
    catalog: ['warn', 'добавлена · в каталоге правки'],
    mine: ['info', 'добавлена · есть твои правки'],
    both: ['warn', 'добавлена · правки в каталоге и у тебя']
  };

  const fmt = v => v == null ? '—' : v;
  const val = (k, v) => fmt(k === 'use' && v ? F().useLabel(v) : v);
  const diffRows = (rows, from, to) => `<div class="catdiffh">${from} → ${to}</div><ul>`
    + rows.map(([k, a, b]) => `<li>${esc(F().label(k))}: ${esc(val(k, a))} → ${esc(val(k, b))}</li>`).join('') + '</ul>';

  function rowHTML(e, cur) {
    const s = status(e), st = STATUS[s.state];
    const geo = [e.use ? F().useLabel(e.use) : null, `reach ${e.reach}`, `stack ${e.stack}`, `HTA ${e.hta}°`,
                 e.rigid ? 'жёсткая вилка' : `ход ${e.travelRef}`].filter(Boolean).join(' · ');
    const check = s.state === 'none'
      ? `<input type="checkbox" class="catpick" data-id="${esc(e.id)}"${pickedIds.has(e.id) ? ' checked' : ''} aria-label="Выбрать ${esc(e.name)}">`
      : '<span class="catpickph"></span>';
    let extra = '';
    if (st) {
      const where = s.state === 'match'
        ? `как «${esc(s.names.join('», «'))}»`
        : s.name !== e.name ? `как «${esc(s.name)}»` : '';
      extra += `<div class="catst ${st[0]}">${st[1]}${where ? ` <span class="catas">${where}</span>` : ''}</div>`;
    }
    if (s.state === 'match') {
      extra += s.names.map(n => `<button type="button" class="catlink" data-id="${esc(e.id)}" data-name="${esc(n)}">`
        + `Связать${s.names.length > 1 ? ` «${esc(n)}»` : ''} с каталогом</button>`).join(' ')
        + '<div class="pshint">Тогда здесь будут видны правки каталога для этой рамы. Пустые поля паспорта модели заполнятся из каталога.</div>';
    }
    if (['catalog', 'mine', 'both'].includes(s.state)) {
      const body = (s.cat.length ? diffRows(s.cat, 'было при добавлении', 'в каталоге сейчас') : '')
                 + (s.mine.length ? diffRows(s.mine, 'было при добавлении', 'у тебя сейчас') : '');
      extra += `<details class="catdiff" data-id="${esc(e.id)}"${openDiff.has(e.id) ? ' open' : ''}><summary>Что изменилось</summary>${body}`
        + `<button type="button" class="cattake" data-id="${esc(e.id)}">Взять из каталога</button>`
        + `<div class="pshint">Поля рамы и паспорта станут как в каталоге; ход, sag и замена вилки останутся твоими.</div></details>`;
    }
    /* label — только у строки с галочкой: клик по всей строке её ставит. У
       добавленной рамы label переадресовал бы клик на кнопку «Взять из каталога». */
    const tag = s.state === 'none' ? 'label' : 'div';
    // источник — таблица производителя; ссылка, а не запрос: страница по ней ничего не грузит
    const src = /^https:\/\//.test(e.src || '')
      ? ` · <a class="catsrc" href="${esc(e.src)}" target="_blank" rel="noopener noreferrer">таблица производителя ↗</a>` : '';
    /* Кнопки — рядом с названием, у любой рамы, в том числе уже добавленной: посмотреть
       можно и то, и другое. Когда слот уже показывает эту раму, кнопка отмечена. */
    cur = cur || slotState();
    const showBtns = P().showSlots().map(([label, slot], i) => {
      const on = shownIn(e, cur[i]);
      return `<button type="button" class="catshow${on ? ' on' : ''}" data-id="${esc(e.id)}" data-slot="${slot == null ? '' : slot}"`
        + ` aria-pressed="${on}" title="${on ? 'Эта рама сейчас в слоте — открыта без сохранения' : 'Показать без добавления в пресеты'}">${esc(label)}</button>`;
    }).join('');
    return `<${tag} class="catrow${s.state === 'none' ? '' : ' have'}">${check}<span class="catmain">`
      + `<span class="catnamerow"><span class="catname">${esc(e.name)}</span>${showBtns ? `<span class="catshows">${showBtns}</span>` : ''}</span><span class="catgeo">${esc(geo)}${src}</span>${extra}</span></${tag}>`;
  }

  function bodyHTML() {
    const list = filtered(), cur = slotState();
    const sel = ([k, l]) => `<label class="catf">${l}<select data-f="${k}"><option value="">все</option>`
      + values(k).map(v => {
          const n = filtered({ ...filt, [k]: String(v) }).length;
          return `<option value="${esc(v)}"${String(filt[k]) === String(v) ? ' selected' : ''}>${esc(valLabel(k, v))} (${n})</option>`;
        }).join('')
      + '</select></label>';
    const anyF = FILTERS.some(([k]) => filt[k] !== '');
    const n = [...pickedIds].filter(id => byId(id) && status(byId(id)).state === 'none').length;
    return `<div class="catfilters">${FILTERS.map(sel).join('')}`
      + `<button type="button" class="catreset"${anyF ? '' : ' disabled'}>Сбросить</button></div>`
      + `<div class="catcount">${list.length === ENTRIES.length ? `рам в каталоге: ${ENTRIES.length}` : `показано ${list.length} из ${ENTRIES.length}`}</div>`
      + `<div class="catlist">${list.length ? list.map(e => rowHTML(e, cur)).join('') : '<div class="hint">Под эти фильтры рам нет.</div>'}</div>`
      + `<div class="catfoot"><button type="button" class="catadd"${n ? '' : ' disabled'}>Добавить выбранные${n ? ` (${n})` : ''}</button>`
      + `<span class="pshint">Рамы появятся в списке пресетов рамы на обеих страницах, закреплёнными вверху.</span></div>`;
  }

  /* ---------- окно ---------- */

  let dlg = null;
  const track = name => { if (typeof global.track === 'function') global.track(name); };

  /* Окно пересобирается на каждое действие; прокрутку списка сохраняем, иначе
     после «Связать» или галочки внизу списка он уезжал бы в начало. */
  function render() {
    if (!dlg) return;
    const old = dlg.querySelector('.catlist'), y = old ? old.scrollTop : 0;
    dlg.querySelector('.catbody').innerHTML = bodyHTML();
    const list = dlg.querySelector('.catlist'); if (list) list.scrollTop = y;
  }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'catdlg';
    dlg.setAttribute('aria-label', 'Каталог рам');
    dlg.innerHTML = '<div class="cathead"><h2>Каталог рам</h2><button type="button" class="catclose" aria-label="Закрыть">✕</button></div>'
      + '<div class="catbody"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', ev => {
      const t = ev.target;
      if (t === dlg || t.closest('.catclose')) { dlg.close(); return; }       // клик мимо окна закрывает
      const sh = t.closest('.catshow');
      if (sh) {
        ev.preventDefault();                                                   // кнопка внутри label не должна ставить галочку
        const name = show(sh.dataset.id, sh.dataset.slot === '' ? null : +sh.dataset.slot);
        render();
        if (name) track('catalog-show');
        return;
      }
      if (t.closest('.catreset')) { FILTERS.forEach(([k]) => filt[k] = ''); render(); dlg.querySelector('.catlist').scrollTop = 0; return; }
      if (t.closest('.catadd')) {
        const names = add([...pickedIds]); pickedIds.clear();
        P().refresh(); render();
        if (names.length) { track('catalog-add'); P().toast(`добавлено рам: ${names.length}`); }
        return;
      }
      const lk = t.closest('.catlink');
      if (lk) {
        const name = link(lk.dataset.id, lk.dataset.name);
        P().refresh(); render();
        if (name) { track('catalog-link'); P().toast('связана с каталогом: ' + name); }
        return;
      }
      const tk = t.closest('.cattake');
      if (tk) {
        ev.preventDefault();
        const e = byId(tk.dataset.id), s = status(e);
        // у тебя сейчас → станет по каталогу
        if (s.mine && s.mine.length && !confirm(`Твои правки в «${s.name}» пропадут: `
            + s.mine.map(([k, , cur]) => `${F().label(k)} ${val(k, cur)} → ${val(k, norm(e[k]))}`).join(', ') + '. Взять раму из каталога?')) return;
        const name = take(e.id);
        P().refresh(); render();
        if (name) { track('catalog-take'); P().toast('обновлена из каталога: ' + name); }
      }
    });
    dlg.addEventListener('change', ev => {
      const t = ev.target;
      // другой фильтр — другой список: прокрутка с начала
      if (t.matches('select[data-f]')) { filt[t.dataset.f] = t.value; render(); dlg.querySelector('.catlist').scrollTop = 0; return; }
      if (t.matches('.catpick')) { t.checked ? pickedIds.add(t.dataset.id) : pickedIds.delete(t.dataset.id); render(); }
    });
    // раскрытое «Что изменилось» помним до перезагрузки: окно пересобирается на каждое действие
    dlg.addEventListener('toggle', ev => {
      const d = ev.target; if (!d.matches || !d.matches('.catdiff')) return;
      d.open ? openDiff.add(d.dataset.id) : openDiff.delete(d.dataset.id);
    }, true);
  }

  function open() {
    if (!P().ok) { P().toast('хранилище недоступно в этом браузере — добавлять некуда', true); return; }
    if (!dlg) build();
    render();
    const m = document.activeElement && document.activeElement.closest && document.activeElement.closest('details.menu');
    if (m) m.open = false;                                                     // меню, из которого открыли, закрываем
    dlg.showModal();
    track('catalog-open');
  }

  global.BikeCatalog = { ENTRIES, FRAME, META, CMP, FILTERS, status, add, take, link, show, shownIn, toPreset, freeName, filtered, values, sizeGroup,
                         rowHTML, bodyHTML, open, _filt: filt, _picked: pickedIds };

})(typeof globalThis !== 'undefined' ? globalThis : this);
