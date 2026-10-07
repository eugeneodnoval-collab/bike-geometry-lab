/*
  Пресеты: хранилище, импорт и экспорт, строка «выбрать / сохранить / удалить».
  Одна реализация на обе страницы с расчётами.

  Раньше код лежал копией в index.html и fit-lab.html, и копии разошлись там, где
  это стоило данных. Хранилище у страниц общее — один ключ, один блоб, — а списки
  ключей и санация импорта были разные. Страница сравнения держала белые списки
  от старой раскладки: импорт файла на ней урезал пресеты райдера до шестнадцати
  полей из тридцати девяти, перезаписывал этим одноимённый пресет в хранилище и
  молча пропускал пресеты руля, выноса и железа. Вред доставался обеим страницам.

  Здесь только то, что от страницы не зависит. Что положить в пресет, как
  разложить его по состоянию и где взять имя — страница передаёт в init().

  Классический скрипт, не модуль: с file:// модули не грузятся. Подключается
  после model.js и до скрипта страницы — страница строит встроенные пресеты
  через pick() прямо при загрузке.
*/
(function (global) {
  'use strict';

  const KEY = 'bikelab.presets.v1';

  /* Белые списки по видам. Эталон — Fit Lab: у него раскладка полнее.
     Страница сравнения пользуется только geo, но импорт и разбор старых записей
     обязаны знать все виды — иначе файл, импортированный здесь, терял бы то, что
     нужно соседней странице.

     Кокпит разложен на три вида по тому, как железо меняют в жизни: руль, вынос
     с проставками и всё остальное. Перебирают обычно первые два, причём по
     отдельности. Чашка рулевой — свойство рулевой, а не выноса, поэтому она в
     «остальном»; высота обхвата — свойство конкретного выноса, поэтому с ним. */
  const KEYS = {
    geo : ['reach','stack','hta','sta','ht','st','cs','bbDrop','wb','offset','travelRef','travel','sag','dHta','rigid','wheelR',
           'forkA2C','forkA2Cnew','forkOffsetNew','forkOffsetSpec','forkMeasLen',
           // паспорт модели: в расчёт не входит, подписи для каталога (frame.js — META)
           'brand','model','year','size','use'],
    bar : ['barWidth','barRise','backsweep','upsweep','barRoll','gripInset','riserBendHalf'],
    stem: ['stemLen','stemAngle','stemFlip','spacers','stemClampH'],
    hw  : ['headsetStack','pedalStack','crank','qFactor','postOffset','railPos'],
    /* Старый общий вид кокпита. В интерфейсе его нет, но он остаётся в белых
       списках, чтобы импорт файла со старым пресетом не потерял его молча:
       splitCk() разложит такой пресет на три сразу после загрузки. */
    ck  : ['headsetStack','spacers','stemClampH','stemLen','stemAngle','stemFlip','barRise','barWidth',
           'backsweep','upsweep','barRoll','gripInset','riserBendHalf','pedalStack','crank','qFactor','postOffset','railPos'],
    body: ['height','inseam','shoulderW','armLen','hipW','femurPct','ankleH','soleThk','wristGrip','hipAbove',
           'hipFwd','torso','kneeTarget','radMult','pedalUp','pedalBack',
           'sitHeight','trunkLen','femurLen','tibiaLen','upperArm','foreArm','footLen','heelToMet','sitBoneW',
           'weight','pedalShare','shExt','kneeStand','elbowStand','handShareStand','bikePitch','hipBackStand',
           'spineFlex','lumbarPivot','elbowFlare','palmDiag','pedalPos','soleTilt']
  };

  /* Ключи, значение которых — строка: бренд, модель, размер «M/L», назначение.
     Остальные значения пресета — числа, и строка в них при импорте либо
     приводится к числу, либо выбрасывается как мусор. Список свой, а не из
     frame.js: пресеты подключаются и там, где паспорта рамы нет, — а регресс
     сверяет, что списки совпадают. */
  const TEXT = ['brand', 'model', 'size', 'use'];
  // управляющие символы вон, пробелы по краям тоже; длина — с запасом на «Grand Canyon CF SLX 9 AXS»
  const text = v => { const t = String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80); return t || null; };

  const esc = s => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const byName = (a, b) => a.localeCompare(b, 'ru', { numeric: true });

  /* Пресет -> состояние: только ключи белого списка, каждый — число или null,
     текстовые — строка или null. */
  function pick(kind, src) {
    const o = {};
    (KEYS[kind] || []).forEach(k => {
      const v = src[k];
      if (v === undefined || v === null || v === '') { o[k] = null; return; }
      if (TEXT.includes(k)) { o[k] = typeof v === 'string' || typeof v === 'number' ? text(v) : null; return; }
      const n = typeof v === 'number' ? v : parseFloat(v);
      o[k] = isFinite(n) ? n : null;
    });
    return o;
  }

  /* Санация при ИМПОРТЕ: сохраняем любые числовые ключи, а белый список
     применяется при ЗАГРУЗКЕ пресета в состояние. Иначе импорт файла из более
     новой версии страницы навсегда вырезал бы незнакомые ключи из хранилища —
     а так они переживают импорт и «оживают» после обновления страницы. Мусор в
     состояние всё равно не попадает: путь туда лежит только через pick(). */
  function any(src) {
    const o = {}; let n = 0;
    for (const k of Object.keys(src)) {
      if (++n > 300) break;
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(k)) continue;
      const v = src[k];
      if (v === undefined || v === null || v === '') { o[k] = null; continue; }
      if (TEXT.includes(k)) { if (typeof v === 'string' || typeof v === 'number') o[k] = text(v); continue; }
      const num = typeof v === 'number' ? v : parseFloat(v);
      if (isFinite(num)) o[k] = num;
    }
    return o;
  }

  /* Отметка в служебном разделе блоба: o.pinned.geo['имя'] = true.
     v === undefined — снять отметку; пустые разделы убираются, чтобы экспорт
     не таскал за собой скелет из пустых объектов. */
  function flag(o, sect, kind, name, v) {
    const s = o[sect] = o[sect] && typeof o[sect] === 'object' ? o[sect] : {};
    const k = s[kind] = s[kind] && typeof s[kind] === 'object' ? s[kind] : {};
    if (v === undefined) delete k[name]; else k[name] = v;
    if (!Object.keys(k).length) delete s[kind];
    if (!Object.keys(s).length) delete o[sect];
  }

  /* Всё в try/catch: на file:// хранилище бывает запрещено. Тогда строки
     пресетов гаснут, а страница живёт. */
  const ok = (() => { try { localStorage.setItem('__ps', '1'); localStorage.removeItem('__ps'); return true; } catch (e) { return false; } })();
  const store = {
    read() { if (!ok) return {}; try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    write(o) { if (!ok) return false; try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } },
    list(kind) { return Object.keys(store.read()[kind] || {}).sort((a, b) => a.localeCompare(b, 'ru')); },
    // имя пресета — ключ в объекте, поэтому сохранение под существующим именем и есть обновление
    save(kind, name, data) { const o = store.read(); (o[kind] = o[kind] || {})[name] = data; return store.write(o); },
    del(kind, name) { const o = store.read(); if (o[kind]) delete o[kind][name]; return store.write(o); },
    merge(inc) {
      if (!inc || typeof inc !== 'object') return false;
      const o = store.read(); let n = 0;
      Object.keys(KEYS).forEach(kind => {
        const src = inc[kind]; if (!src || typeof src !== 'object') return;
        o[kind] = o[kind] || {};
        Object.entries(src).forEach(([name, v]) => { if (v && typeof v === 'object' && name.trim()) { o[kind][name] = any(v); n++; } });
      });
      /* Закрепления переезжают вместе с пресетами — файл переносит список таким,
         каким его настроили. Удаления встроенных — нет: импорт только добавляет
         и никогда ничего не убирает из списка. */
      const pins = inc.pinned;
      if (pins && typeof pins === 'object') Object.keys(KEYS).forEach(kind => {
        const src = pins[kind]; if (!src || typeof src !== 'object') return;
        Object.entries(src).forEach(([name, v]) => { if (typeof v === 'boolean' && name.trim()) flag(o, 'pinned', kind, name, v); });
      });
      /* Связи с каталогом (catalog.js) переезжают тоже: без них рама, добавленная
         из каталога, на другом устройстве не узнала бы правок в каталоге. */
      const cat = inc.catalog && inc.catalog.geo;
      if (cat && typeof cat === 'object') Object.entries(cat).forEach(([name, v]) => {
        if (name.trim() && v && typeof v.id === 'string' && v.id.length < 120 && v.snap && typeof v.snap === 'object')
          flag(o, 'catalog', 'geo', name, { id: v.id, snap: pick('geo', v.snap) });
      });
      return n > 0 && store.write(o) ? n : false;
    }
  };

  /* Разложить старые пресеты кокпита на три. Запускается при загрузке страницы и
     после импорта: и в хранилище, и в присланном файле может лежать пресет
     прежней формы. Имя сохраняется у всех трёх — пользователь узнает свой кокпит
     в каждом списке и дальше может смешивать половинки от разных. Уже
     существующий одноимённый пресет нового вида не перезаписывается. */
  function splitCk() {
    const o = store.read(); if (!o.ck) return 0;
    let n = 0;
    ['bar', 'stem', 'hw'].forEach(k => o[k] = o[k] || {});
    Object.entries(o.ck).forEach(([name, d]) => {
      if (!d || typeof d !== 'object' || !name.trim()) return;
      ['bar', 'stem', 'hw'].forEach(k => { if (!o[k][name]) o[k][name] = pick(k, d); });
      n++;
    });
    delete o.ck; store.write(o);
    return n;
  }

  /* ---------- строка пресета в карточке ---------- */

  let page = null;              // что передала страница в init()
  const sel = {};               // что выбрано в выпадашке: 'p:имя' | ''
  const typed = {};             // набранное имя, чтобы пережить перестройку карточек
  const slotKey = (kind, slot) => kind + (slot == null ? '' : slot);
  const track = name => { if (typeof global.track === 'function') global.track(name); };

  /* ---------- один список: закреплённые сверху, удалить можно любой ----------

     Встроенные пресеты — это данные страницы, а не хранилища, и в хранилище не
     копируются: иначе исправленная в коде рама никогда не дошла бы до того, кто
     открывал страницу раньше. Поверх них в блобе лежат два служебных раздела:

       pinned  {вид: {имя: true|false}}  явная отметка пользователя;
                                         без неё встроенный закреплён, свой — нет
       removed {вид: {имя: true}}        встроенный, который пользователь удалил
       catalog {geo: {имя: {id, snap}}}  рама добавлена из каталога: id записи и её
                                         поля на момент добавления (catalog.js)

     Свой пресет с именем встроенного закрывает его: сохранил под этим именем —
     в списке одна запись, твоя. Удаление убирает имя целиком, и свою запись, и
     встроенную под ней, — иначе после «удалить» в списке осталось бы то же имя. */
  const builtinOf = kind => (page && page.builtin[kind]) || {};

  /* Данные пресета по имени: свой, иначе встроенный, если его не удаляли. */
  function find(kind, name) {
    const o = store.read();
    if (has(o[kind], name)) return o[kind][name];
    const bi = builtinOf(kind);
    return has(bi, name) && !has((o.removed || {})[kind], name) ? bi[name] : null;
  }

  function listing(kind) {
    const o = store.read(), bi = builtinOf(kind), my = o[kind] || {};
    const gone = (o.removed || {})[kind] || {}, pins = (o.pinned || {})[kind] || {};
    const names = new Set(Object.keys(my));
    Object.keys(bi).forEach(n => { if (!has(gone, n)) names.add(n); });
    const pinned = n => typeof pins[n] === 'boolean' && has(pins, n) ? pins[n] : has(bi, n);
    const all = [...names].sort(byName);
    return { pinned: all.filter(pinned), rest: all.filter(n => !pinned(n)),
             removed: Object.keys(bi).filter(n => has(gone, n) && !has(my, n)) };
  }

  /* Закрепить или открепить. Отметка пишется явно, даже совпадающая с умолчанием:
     одно и то же имя может быть встроенным на одной странице и своим на другой. */
  function pin(kind, name, on) {
    if (!find(kind, name)) return false;
    const o = store.read(); flag(o, 'pinned', kind, name, !!on);
    return store.write(o);
  }

  function remove(kind, name) {
    if (!find(kind, name)) return false;
    const o = store.read();
    if (o[kind]) delete o[kind][name];
    if (has(builtinOf(kind), name)) flag(o, 'removed', kind, name, true);
    flag(o, 'pinned', kind, name, undefined);   // вернётся — с умолчанием, а не со старой отметкой
    flag(o, 'catalog', kind, name, undefined);  // связь с каталогом (catalog.js): пресета нет — и рама снова «не добавлена»
    return store.write(o);
  }

  /* Встроенный ли пресет под этим именем: данные страницы, а не хранилища.
     Свой пресет с именем встроенного его закрывает — тогда это уже не он. */
  function isBuiltin(kind, name) {
    return has(builtinOf(kind), name) && !has(store.read()[kind], name);
  }

  /* Переименовать. Пресет живёт под своим именем как ключ, поэтому переезжают и
     все записи, привязанные к ключу: закрепление, связь с каталогом, выбор в
     выпадашках. Занятое имя не перезаписываем — это удалило бы чужой пресет
     молча; «Сохранить» под существующим именем обновляет, переименование — нет.
     Встроенный переименовывается копией: данные страницы мы не правим, поэтому
     под новым именем появляется свой пресет, а старое имя помечается удалённым,
     как при удалении, — вернуть его можно пунктом «↺ Вернуть».
     Вернёт {ok:true} или {ok:false, why: 'empty' | 'taken' | 'missing' | 'bad'}. */
  function rename(kind, from, to) {
    to = String(to == null ? '' : to).trim();
    if (!to) return { ok: false, why: 'empty' };
    if (to === '__proto__') return { ok: false, why: 'bad' };   // ключ-прототип: присваивание подменило бы объект, а не добавило запись
    if (to === from) return { ok: true, same: true };
    const data = find(kind, from);
    if (!data) return { ok: false, why: 'missing' };
    if (find(kind, to)) return { ok: false, why: 'taken' };
    const wasPinned = listing(kind).pinned.includes(from);
    const o = store.read(), link = ((o.catalog || {})[kind] || {})[from];
    (o[kind] = o[kind] || {})[to] = data;
    delete o[kind][from];
    if (has(builtinOf(kind), from)) flag(o, 'removed', kind, from, true);
    flag(o, 'removed', kind, to, undefined);     // имя могло числиться удалённым встроенным — теперь за ним свой пресет
    flag(o, 'pinned', kind, from, undefined);
    flag(o, 'pinned', kind, to, wasPinned);      // явно: умолчание у нового имени может быть другим
    if (link) { flag(o, 'catalog', kind, from, undefined); flag(o, 'catalog', kind, to, link); }
    if (!store.write(o)) return { ok: false, why: 'write' };
    // выбранное в выпадашках и набранное имя идут за пресетом
    Object.keys(sel).forEach(k => { if (k.startsWith(kind) && sel[k] === 'p:' + from) sel[k] = 'p:' + to; });
    Object.keys(typed).forEach(k => { if (k.startsWith(kind) && typed[k] === from) typed[k] = to; });
    if (page && page.renamed) page.renamed(kind, from, to);
    return { ok: true };
  }

  /* Вернуть удалённые встроенные этого вида. Вернёт, сколько вернулось. */
  function restore(kind) {
    const back = listing(kind).removed; if (!back.length) return 0;
    const o = store.read(); back.forEach(n => flag(o, 'removed', kind, n, undefined));
    return store.write(o) ? back.length : 0;
  }

  function options(kind, cur) {
    const opt = (v, l) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    const L = listing(kind), items = ns => ns.map(n => opt('p:' + n, n)).join('');
    let h = opt('', '— выбрать пресет —');
    if (L.pinned.length) h += `<optgroup label="Закреплённые">${items(L.pinned)}</optgroup>`;
    // без закреплённых группа «Остальные» ни от чего не отделяет — список просто плоский
    if (L.rest.length) h += L.pinned.length ? `<optgroup label="Остальные">${items(L.rest)}</optgroup>` : items(L.rest);
    if (L.removed.length) h += `<optgroup label="Удалённые встроенные">${opt('r:', `↺ Вернуть (${L.removed.length})`)}</optgroup>`;
    return h;
  }

  const PIN_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M10 1.8l4.2 4.2-1.6.9-2.6 2.6.4 3.1-1.3 1.3-2.9-2.9-3.6 3.6-.6.1.1-.6 3.6-3.6-2.9-2.9 1.3-1.3 3.1.4 2.6-2.6z"/></svg>';

  /* nm — поле имени над строкой, если имя пресета не берётся из самой карточки.
     Стоит НАД строкой, а не в ней: тогда в строке остаются выпадашка и две
     кнопки, и она влезает в одну линию даже в узкой панели. */
  function rowHTML(kind, slot, hint, nm) {
    const name = nm ? `<input class="bikename psname"${nm.id ? ` id="${nm.id}"` : ''}`
      + ` value="${esc(nm.value || '')}" placeholder="${esc(nm.ph)}" aria-label="${esc(nm.ph)}">` : '';
    return `<div class="psbox">${name}<div class="psrow" data-kind="${kind}"${slot == null ? '' : ` data-slot="${slot}"`}>
      <select class="pssel" aria-label="Пресет"></select>
      <button class="pspin" type="button" title="Закрепить вверху списка" aria-pressed="false" disabled>${PIN_ICON}</button>
      <button class="pssave" type="button">Сохранить</button>
      <button class="psdel" type="button" title="Удалить пресет" disabled>✕</button>
    </div>${hint ? `<div class="pshint">${hint}</div>` : ''}</div>`;
  }

  /* Перерисовка списков. Страница зовёт после каждой пересборки карточек:
     buildInputs() сносит разметку вместе со строками пресетов. */
  function refresh() {
    document.querySelectorAll('.psrow').forEach(row => {
      const kind = row.dataset.kind, k = slotKey(kind, row.dataset.slot);
      // выбранный мог пропасть — удалён в соседнем слоте или в другой вкладке
      if (sel[k] && !find(kind, sel[k].slice(2))) sel[k] = '';
      const cur = sel[k] || '', name = cur.slice(2);
      const s = row.querySelector('.pssel'), del = row.querySelector('.psdel'), save = row.querySelector('.pssave');
      const pinb = row.querySelector('.pspin');
      const nm = row.closest('.psbox').querySelector('.psname');
      s.innerHTML = options(kind, cur);
      // имя рамы живёт в состоянии страницы и уже отрисовано; у остальных восстанавливаем набранное
      if (nm && kind !== 'geo') nm.value = typed[k] != null ? typed[k] : name;
      const on = !!cur && listing(kind).pinned.includes(name);
      del.disabled = !cur;
      pinb.disabled = !cur;
      pinb.setAttribute('aria-pressed', on ? 'true' : 'false');
      pinb.title = on ? 'Открепить' : 'Закрепить вверху списка';
      if (!ok) { s.disabled = true; save.disabled = true; del.disabled = true; pinb.disabled = true; if (nm) nm.disabled = true; }
    });
  }

  /* Загрузить пресет в страницу по имени — свой или встроенный, find() решит.
     Отдельной функцией, а не внутри обработчика, чтобы путь «пресет -> состояние»
     можно было прогнать в регрессе без DOM-событий. Вернёт имя или false. */
  function load(kind, slot, name) {
    const data = find(kind, name);
    if (!data) return false;
    typed[slotKey(kind, slot)] = name;
    page.apply(kind, slot, pick(kind, data), name);
    return name;
  }

  /* Показать раму на странице, не записывая её в хранилище: кнопки каталога
     «→ Рама 1», «Открыть в Fit Lab». Тот же путь, что у load(), но данные
     приходят не из пресета, а от вызывающего — пресет от этого не появляется.
     Выбор в выпадашке слота сбрасывается: иначе в нём осталось бы имя прежней
     рамы, а «Сохранить» и «✕» относились бы к ней, а не к показанной. */
  function show(kind, slot, data, name) {
    if (!page) return false;
    sel[slotKey(kind, slot)] = '';
    typed[slotKey(kind, slot)] = name;
    page.apply(kind, slot, pick(kind, data), name);
    refresh();
    return name;
  }

  /* Куда страница умеет показывать раму из каталога: [[подпись кнопки, слот], …].
     Страница сравнения — два слота, Fit Lab — один. Сама кнопка живёт в каталоге,
     а слотов и подписей он не знает: список приходит из init(). */
  const showSlots = () => (page && page.showSlots) || [];
  /* Что сейчас в слоте страницы — тем же путём, каким оно сохранилось бы в пресет. */
  const current = (kind, slot) => page ? page.collect(kind, slot) : null;

  /* Сохранить текущее состояние страницы под именем. Тоже отдельной функцией:
     путь «состояние -> пресет» проходит через collect страницы, и регресс должен
     гонять именно его, а не собирать пресет сам. Вернёт true, если записалось. */
  function save(kind, slot, name) {
    if (!store.save(kind, name, page.collect(kind, slot))) return false;
    const k = slotKey(kind, slot);
    sel[k] = 'p:' + name; typed[k] = name;
    return true;
  }

  function toast(msg, bad) {
    const el = document.getElementById('psok'); if (!el) return;
    el.textContent = msg; el.style.color = bad ? '#b3261e' : '#0a7d33'; el.style.visibility = 'visible';
    clearTimeout(toast._t); toast._t = setTimeout(() => el.style.visibility = 'hidden', 2600);
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify({ app: 'bikelab', v: 1, ...store.read() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bike-presets-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    track('preset-export'); toast('файл скачан');
  }

  function importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      let n = false; try { n = store.merge(JSON.parse(r.result)); } catch (e) {}
      if (n) { splitCk(); refresh(); track('preset-import'); toast(`загружено пресетов: ${n}`); }
      else toast('не похоже на файл пресетов', true);
    };
    r.onerror = () => toast('не смог прочитать файл', true);
    r.readAsText(file);
  }

  /*
    init({builtin, collect, apply, nameFor})
      builtin              {вид: {имя: пресет}} — данные страницы: по умолчанию закреплены,
                           удаляются пометкой в хранилище, сами не меняются
      collect(kind, slot)  текущее состояние -> пресет
      apply(kind, slot, data, name)  пресет (уже через pick) -> состояние; перерисовка на странице
      nameFor(row)         под каким именем сохранять
      showSlots            [[подпись, слот], …] — куда каталог рам может показать раму
                           без сохранения; нет — кнопок в каталоге нет
      renamed(kind, from, to)  необязательный: пресет переименован в окне управления;
                           рама в слоте, названная по нему, должна сменить имя, иначе
                           «Сохранить» вернёт старое. Для видов без имени в состоянии не нужен

    Обработчики делегированы на document: страница пересобирает карточки, и
    привязка к самим строкам терялась бы при каждой пересборке.
  */
  function init(cfg) {
    if (page) throw new Error('BikePresets.init вызван дважды');
    page = cfg;
    splitCk();

    // набранное имя запоминаем сразу: пересборка карточки сотрёт поле
    document.addEventListener('input', e => {
      const nm = e.target.closest && e.target.closest('.psname'); if (!nm) return;
      const row = nm.closest('.psbox').querySelector('.psrow');
      typed[slotKey(row.dataset.kind, row.dataset.slot)] = nm.value;
    });

    document.addEventListener('change', e => {
      const s = e.target.closest && e.target.closest('.pssel'); if (!s) return;
      const row = s.closest('.psrow'), kind = row.dataset.kind, slot = row.dataset.slot, v = s.value;
      const k = slotKey(kind, slot);
      if (v === 'r:') {                           // «вернуть удалённые встроенные» — действие, а не выбор
        sel[k] = '';
        const n = restore(kind);
        refresh(); track('preset-restore-' + kind);
        toast(n ? `возвращено встроенных: ${n}` : 'нечего возвращать', !n);
        return;
      }
      sel[k] = v;
      if (!v) { refresh(); return; }
      const name = load(kind, slot, v.slice(2));
      if (!name) { toast('пресет не найден', true); return; }
      refresh(); track('preset-load-' + kind); toast('загружен: ' + name);
    });

    document.addEventListener('click', e => {
      const t = e.target; if (!t.closest) return;
      // Кнопки названы saveBtn/delBtn, а не save/del: иначе они перекрывают функцию save()
      const saveBtn = t.closest('.pssave'), delBtn = t.closest('.psdel'), pinBtn = t.closest('.pspin');
      if (pinBtn) {
        const row = pinBtn.closest('.psrow'), kind = row.dataset.kind, k = slotKey(kind, row.dataset.slot);
        const cur = sel[k] || ''; if (!cur) return;
        const name = cur.slice(2), on = !listing(kind).pinned.includes(name);
        if (!pin(kind, name, on)) { toast('не удалось закрепить', true); return; }
        refresh(); track((on ? 'preset-pin-' : 'preset-unpin-') + kind);
        toast((on ? 'закреплён: ' : 'откреплён: ') + name);
      } else if (saveBtn) {
        const row = saveBtn.closest('.psrow'), kind = row.dataset.kind, slot = row.dataset.slot;
        const name = page.nameFor(row);
        if (!name) { toast('сначала впиши имя', true); return; }
        if (!save(kind, slot, name)) { toast('не удалось сохранить', true); return; }
        refresh(); track('preset-save-' + kind); toast('сохранено: ' + name);
      } else if (delBtn) {
        const row = delBtn.closest('.psrow'), kind = row.dataset.kind, slot = row.dataset.slot, k = slotKey(kind, slot);
        const cur = sel[k] || ''; if (!cur) return;
        const name = cur.slice(2);
        const builtin = has(builtinOf(kind), name) ? '\nЭто встроенный пресет — его можно будет вернуть из этого же списка.' : '';
        if (!confirm(`Удалить пресет «${name}»?${builtin}`)) return;
        if (!remove(kind, name)) { toast('не удалось удалить', true); return; }
        sel[k] = '';
        refresh(); track('preset-delete-' + kind); toast('удалён: ' + name);
      }
    });

    // другая вкладка изменила пресеты — подхватываем список
    window.addEventListener('storage', e => { if (e.key === KEY) refresh(); });
  }

  global.BikePresets = { KEY, KEYS, TEXT, ok, pick, any, store, splitCk,
                         init, load, show, showSlots, current, save, find, listing, pin, remove, rename, isBuiltin, restore, rowHTML, refresh, toast, exportFile, importFile };

})(typeof globalThis !== 'undefined' ? globalThis : this);
