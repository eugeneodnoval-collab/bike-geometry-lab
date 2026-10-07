/*
  Управление пресетами: окно, где все пресеты одного вида видны списком, их можно
  отметить несколько и удалить разом, а любой — переименовать. Пункт меню
  «Пресеты» на обеих страницах. Хранилище и операции — presets.js (remove, rename),
  здесь только окно.

  Зачем отдельное окно. Выпадашка в карточке показывает имена и умеет удалять
  по одному: когда пресетов под сотню, чистка превращается в сотню
  «выбрать → ✕ → подтвердить», а переименовать нельзя вовсе (только сохранить
  копию под новым именем и удалить старую, потеряв закрепление и связь с каталогом).

  Виды показываются вкладками, как они лежат в хранилище: рамы, рули, выносы,
  железо, райдеры. Вкладка есть, только если в виде что-то есть. Пресеты других
  страниц видны и здесь: хранилище общее, а удалить лишнее руль-пресет со страницы
  сравнения, где руля нет, — законное желание.

  Выбор живёт внутри одного вида и только среди показанных: сменил вкладку или
  набрал поиск — скрытые из выбора выпадают. Иначе «Удалить выбранные (3)» могло
  бы задеть пресеты, которых на экране нет, и человек узнал бы об этом из
  подтверждения. Подтверждение всё равно перечисляет имена.

  Закрепить и открепить — тоже над выбранными: кнопка считает, сколько из выбранных
  действительно сменит состояние, и гаснет, если менять нечего. Выбор после этого
  остаётся — человек видит бирки «закреплён» у тех же строк и может сразу удалить.

  Удаление не снимает пресет со страницы: рама, уже загруженная в слот, остаётся
  в слоте — как и при «✕» в карточке.

  Окно пересобирается на каждое действие, поле поиска — нет: иначе оно теряло бы
  фокус на каждом символе. Классический скрипт, не модуль: с file:// модули не
  грузятся. Подключается после presets.js; оболочка окна (.catdlg) — общая с
  каталогом рам, стили в tools.css.
*/
(function (global) {
  'use strict';

  const KINDS = [['geo', 'Рамы'], ['bar', 'Рули'], ['stem', 'Выносы'], ['hw', 'Железо'], ['body', 'Райдеры']];
  const P = () => global.BikePresets;
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const num = v => typeof v === 'number' && isFinite(v);

  const WHY = {
    empty: 'Имя не может быть пустым.',
    taken: 'Пресет с таким именем уже есть — выбери другое имя.',
    missing: 'Пресет не найден — возможно, его удалили в другой вкладке.',
    bad: 'Такое имя использовать нельзя.',
    write: 'Не удалось записать — хранилище браузера недоступно.'
  };

  /* Что внутри пресета, одной строкой: по ней отличают «Floater 120» от
     «Floater 120 (каталог)». Только поля, которые есть; пустые не выдумываем. */
  function summary(kind, d) {
    d = d || {};
    const f = [];
    const add = (v, fn) => { if (num(v)) f.push(fn(v)); };
    if (kind === 'geo') {
      add(d.reach, v => `reach ${v}`); add(d.stack, v => `stack ${v}`); add(d.hta, v => `HTA ${v}°`);
      if (d.rigid) f.push('жёсткая вилка'); else add(d.travelRef, v => `ход ${v}`);
    } else if (kind === 'bar') {
      add(d.barWidth, v => `${v} мм`); add(d.barRise, v => `rise ${v}`);
      add(d.backsweep, v => `backsweep ${v}°`); add(d.upsweep, v => `upsweep ${v}°`);
    } else if (kind === 'stem') {
      add(d.stemLen, v => `${v} мм`); add(d.stemAngle, v => `${v}°`);
      add(d.spacers, v => `проставки ${v}`);
    } else if (kind === 'hw') {
      add(d.crank, v => `шатун ${v}`); add(d.qFactor, v => `Q-factor ${v}`);
      add(d.headsetStack, v => `чашка ${v}`);
    } else if (kind === 'body') {
      add(d.height, v => `рост ${Math.round(v / 10)} см`);
    }
    return f.join(' · ');
  }

  /* ---------- данные окна ---------- */

  const view = { kind: 'geo', q: '' };
  const picked = new Set();
  let editing = null;                    // имя пресета в режиме переименования
  let fresh = false;                     // поле имени только что открыто: фокус и выделение
  let msg = '';                          // последняя ошибка переименования

  const all = kind => { const L = P().listing(kind); return [...L.pinned, ...L.rest]; };
  const kinds = () => KINDS.filter(([k]) => all(k).length);
  const match = (n, q) => !q || n.toLowerCase().includes(q.trim().toLowerCase());
  const shown = () => all(view.kind).filter(n => match(n, view.q));
  // из выбранных — кого закрепить и кого открепить (остальные уже в нужном состоянии)
  const pinPlan = () => { const pins = new Set(P().listing(view.kind).pinned), sel = [...picked];
    return { pin: sel.filter(n => !pins.has(n)), unpin: sel.filter(n => pins.has(n)) }; };

  /* Выбор — только среди показанных (см. шапку). Зовётся перед каждой отрисовкой. */
  function trim() {
    const s = new Set(shown());
    [...picked].forEach(n => { if (!s.has(n)) picked.delete(n); });
  }

  /* ---------- разметка ---------- */

  const TAG_PIN = '<span class="pmtag pin" title="Закреплён вверху списка">закреплён</span>';

  function rowHTML(kind, name, pinned) {
    const o = P().store.read();
    const tags = (pinned ? TAG_PIN : '')
      + (P().isBuiltin(kind, name) ? '<span class="pmtag">встроенный</span>' : '')
      + (kind === 'geo' && has(((o.catalog || {}).geo), name) ? '<span class="pmtag">из каталога</span>' : '');
    const sum = summary(kind, P().find(kind, name));
    if (editing === name) {
      const hint = P().isBuiltin(kind, name)
        ? '<div class="pshint">Встроенный пресет переименовывается копией. Прежнее имя можно вернуть пунктом «↺ Вернуть» в списке пресетов.</div>' : '';
      return `<div class="catrow pmrow editing"><span class="catpickph"></span><span class="catmain">`
        + `<input class="pmedit" value="${esc(name)}" aria-label="Новое имя пресета" autocomplete="off" spellcheck="false">`
        + `<div class="pmerr" role="alert">${esc(msg)}</div>${hint}</span>`
        + `<span class="catshows"><button type="button" class="pmbtn pmok">Сохранить</button>`
        + `<button type="button" class="pmbtn pmcancel">Отмена</button></span></div>`;
    }
    // label: клик по всей строке ставит галочку, как в каталоге; кнопка внутри гасит это сама
    return `<label class="catrow pmrow"><input type="checkbox" class="pmpick" data-name="${esc(name)}"${picked.has(name) ? ' checked' : ''}`
      + ` aria-label="Выбрать ${esc(name)}"><span class="catmain"><span class="catnamerow"><span class="catname pmname">${esc(name)}</span>${tags}</span>`
      + (sum ? `<span class="catgeo">${esc(sum)}</span>` : '')
      + `</span><span class="catshows"><button type="button" class="pmbtn pmren" data-name="${esc(name)}">Переименовать</button></span></label>`;
  }

  function tabsHTML() {
    return kinds().map(([k, l]) => `<button type="button" role="tab" class="pmtab${k === view.kind ? ' on' : ''}" data-kind="${k}"`
      + ` aria-selected="${k === view.kind}">${l} <span class="pmn">${all(k).length}</span></button>`).join('');
  }

  /* ---------- окно ---------- */

  let dlg = null;
  const q = sel => dlg.querySelector(sel);
  const track = name => { if (typeof global.track === 'function') global.track(name); };

  function render() {
    if (!dlg) return;
    // вкладка, в которой не осталось пресетов, пропадает: уходим на ближайшую
    const ks = kinds();
    if (!ks.some(([k]) => k === view.kind) && ks.length) { view.kind = ks[0][0]; view.q = ''; q('.pmq').value = ''; picked.clear(); }
    trim();
    const L = P().listing(view.kind), pins = new Set(L.pinned);
    const names = shown(), total = all(view.kind).length;
    const y = q('.pmlist').scrollTop, kept = q('.pmedit') ? q('.pmedit').value : null;   // недописанное имя переживает перерисовку

    q('.pmtabs').innerHTML = tabsHTML();
    q('.pmcount').textContent = !total ? '' : names.length === total
      ? `пресетов: ${total}` : `показано ${names.length} из ${total}`;
    q('.pmlist').innerHTML = names.length ? names.map(n => rowHTML(view.kind, n, pins.has(n))).join('')
      : `<div class="hint">${total ? 'Под этот поиск пресетов нет.' : ks.length ? 'В этом виде пресетов нет.' : 'Пресетов пока нет.'}</div>`;
    q('.pmlist').scrollTop = y;

    const cb = q('.pmallcb'), n = picked.size;
    cb.disabled = !names.length; cb.checked = !!names.length && n === names.length;
    cb.indeterminate = n > 0 && n < names.length;
    const plan = pinPlan();
    q('.pmpin').disabled = !plan.pin.length; q('.pmunpin').disabled = !plan.unpin.length;
    q('.pmpin').textContent = plan.pin.length ? `Закрепить (${plan.pin.length})` : 'Закрепить';
    q('.pmunpin').textContent = plan.unpin.length ? `Открепить (${plan.unpin.length})` : 'Открепить';
    q('.pmdel').disabled = !n;
    q('.pmdel').textContent = n ? `Удалить выбранные (${n})` : 'Удалить выбранные';
    q('.pmtools').hidden = !ks.length;

    const ed = q('.pmedit');
    if (ed && kept != null) ed.value = kept;
    if (ed && fresh) { fresh = false; ed.focus(); ed.select(); }
  }

  function startRename(name) { editing = name; msg = ''; fresh = true; render(); }
  function stopRename() { editing = null; msg = ''; render(); }

  function commitRename() {
    const ed = q('.pmedit'); if (!ed || editing == null) return;
    const from = editing, to = ed.value.trim();
    const r = P().rename(view.kind, from, to);
    if (!r.ok) {
      msg = WHY[r.why] || 'Не удалось переименовать.';
      q('.pmerr').textContent = msg; ed.focus();       // без перерисовки: введённое не должно пропасть
      return;
    }
    editing = null; msg = '';
    if (!r.same) {
      if (picked.delete(from)) picked.add(to);
      P().refresh(); track('preset-rename-' + view.kind); P().toast(`переименован: ${to}`);
    }
    render();
  }

  function deleteSelected() {
    const names = [...picked]; if (!names.length) return;
    const kind = view.kind, bi = names.filter(n => P().isBuiltin(kind, n)).length;
    const list = names.slice(0, 8).map(n => '• ' + n).join('\n') + (names.length > 8 ? `\n…и ещё ${names.length - 8}` : '');
    const note = bi ? `\n\nВстроенных среди них: ${bi} — их можно вернуть пунктом «↺ Вернуть» в списке пресетов.` : '';
    if (!confirm(`Удалить пресеты (${names.length})?\n\n${list}${note}`)) return;
    const done = names.filter(n => P().remove(kind, n));
    picked.clear();
    P().refresh(); render();
    if (done.length) { track('preset-manage-delete'); P().toast(`удалено пресетов: ${done.length}`); }
    if (done.length < names.length) P().toast(`удалено ${done.length} из ${names.length} — остальное не записалось`, true);
  }

  /* Закрепить или открепить выбранных. Вернёт, сколько сменилось. */
  function setPinned(on) {
    const names = pinPlan()[on ? 'pin' : 'unpin'];
    const done = names.filter(n => P().pin(view.kind, n, on));
    if (done.length) { P().refresh(); track((on ? 'preset-pin-' : 'preset-unpin-') + view.kind); P().toast((on ? 'закреплено: ' : 'откреплено: ') + done.length); }
    if (done.length < names.length) P().toast('не всё записалось', true);
    render();
    return done.length;
  }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'catdlg pmdlg';
    dlg.setAttribute('aria-label', 'Управление пресетами');
    dlg.innerHTML = '<div class="cathead"><h2>Управление пресетами</h2><button type="button" class="catclose" aria-label="Закрыть">✕</button></div>'
      + '<div class="catbody">'
      + '<div class="pmtabs" role="tablist"></div>'
      + '<div class="pmtools"><input type="search" class="pmq" placeholder="Найти по имени" aria-label="Найти по имени" autocomplete="off">'
      + '<label class="pmall"><input type="checkbox" class="pmallcb"> выбрать все показанные</label></div>'
      + '<div class="catcount pmcount"></div>'
      + '<div class="catlist pmlist"></div>'
      + '<div class="catfoot"><button type="button" class="pmpin" disabled>Закрепить</button>'
      + '<button type="button" class="pmunpin" disabled>Открепить</button>'
      + '<button type="button" class="pmdel" disabled>Удалить выбранные</button>'
      + '<span class="pshint">Переименовать можно любой пресет, в том числе встроенный. Закреплённые стоят в списке пресетов вверху. Закрепление и связь с каталогом переезжают при переименовании.</span></div>'
      + '</div>';
    document.body.appendChild(dlg);

    dlg.addEventListener('click', ev => {
      const t = ev.target;
      if (t === dlg || t.closest('.catclose')) { dlg.close(); return; }
      const tab = t.closest('.pmtab');
      if (tab) { view.kind = tab.dataset.kind; view.q = ''; q('.pmq').value = ''; picked.clear(); editing = null; msg = ''; render(); q('.pmlist').scrollTop = 0; return; }
      const ren = t.closest('.pmren');
      if (ren) { ev.preventDefault(); startRename(ren.dataset.name); return; }   // кнопка внутри label не должна ставить галочку
      if (t.closest('.pmok')) { commitRename(); return; }
      if (t.closest('.pmcancel')) { stopRename(); return; }
      if (t.closest('.pmpin')) { setPinned(true); return; }
      if (t.closest('.pmunpin')) { setPinned(false); return; }
      if (t.closest('.pmdel')) deleteSelected();
    });

    dlg.addEventListener('change', ev => {
      const t = ev.target;
      if (t.matches('.pmpick')) { t.checked ? picked.add(t.dataset.name) : picked.delete(t.dataset.name); render(); return; }
      if (t.matches('.pmallcb')) { picked.clear(); if (t.checked) shown().forEach(n => picked.add(n)); render(); }
    });

    // поиск: список перерисовывается, само поле — нет
    dlg.addEventListener('input', ev => {
      if (!ev.target.matches('.pmq')) return;
      view.q = ev.target.value; q('.pmlist').scrollTop = 0; render();
    });

    dlg.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('.pmedit')) { ev.preventDefault(); commitRename(); }
    });
    // Escape при открытом поле имени отменяет переименование, а не закрывает окно целиком.
    // Только через cancel: если гасить ещё и keydown, браузер, где cancel всё равно приходит, закрыл бы окно
    dlg.addEventListener('cancel', ev => { if (editing != null) { ev.preventDefault(); stopRename(); } });
    dlg.addEventListener('close', () => { editing = null; msg = ''; picked.clear(); });
  }

  function open() {
    if (!P().ok) { P().toast('хранилище недоступно в этом браузере — управлять нечем', true); return; }
    if (!dlg) build();
    view.q = ''; q('.pmq').value = ''; editing = null; msg = ''; picked.clear();
    const ks = kinds();
    if (ks.length && !ks.some(([k]) => k === view.kind)) view.kind = ks[0][0];
    render();
    const m = document.activeElement && document.activeElement.closest && document.activeElement.closest('details.menu');
    if (m) m.open = false;
    dlg.showModal();
    track('preset-manage-open');
  }

  global.BikePresetManager = { KINDS, summary, rowHTML, shown, trim, setPinned, open, _view: view, _picked: picked };

})(typeof globalThis !== 'undefined' ? globalThis : this);
