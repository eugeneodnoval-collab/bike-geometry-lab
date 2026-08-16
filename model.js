/*
  Общая модель геометрии рамы. Одна физика на все страницы.

  Классический скрипт, не модуль: ES-модули браузер не грузит с file://, а обычный
  <script src> грузит. Поэтому страницы по-прежнему открываются двойным кликом.

  Раньше этот солвер existовал дважды — в index.html и в fit-lab.html, написанный
  в разном стиле. Числа сходились, но держалось это на дисциплине: каждую правку
  приходилось вносить в обе копии руками.

  Наружу отдаётся сырое решение в системе координат каретки, без сдвигов и без
  производных, специфичных для страницы. Своё каждая страница досчитывает сама.
*/
(function (global) {
  'use strict';

  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;

  /*
    solveFrame(bike, wheelR, sagOverride)

    Задача нетривиальна ровно в одном месте: что происходит при смене хода вилки
    или при её просадке. Здесь не правило большого пальца, а кинематика.

    1. Рама строится в системе координат каретки из reach, stack, углов, длин труб,
       перьев и BB drop.
    2. Вилка ВЫВОДИТСЯ из введённой геометрии, а не задаётся формулой. Из положения
       передней оси (её даёт колёсная база при известном BB drop) вычисляется
       составляющая вилки вдоль оси рулевой трубы и её офсет. Поэтому при паспортном
       ходе и sag 0 расчёт совпадает с паспортом до знака после запятой — независимо
       от того, какую вилку ставил производитель.
       Если базы нет, обратно: берём офсет и выводим базу.
    3. Смена хода удлиняет вилку вдоль оси рулевой, sag укорачивает. При заданных
       A2C обеих вилок вместо хода работает их разность — см. ниже.
    4. Рама поворачивается вокруг задней оси на угол, при котором передняя ось снова
       оказывается на высоте радиуса колеса, то есть оба колеса стоят на земле.
       Угол находится аналитически, одним atan2.
    5. Из повёрнутых точек читаются фактические reach, stack, углы, база, трейл.

    Для хардтейла это полная модель — других степеней свободы у рамы нет.
    Размер колеса в решение не входит: обе оси по построению на высоте bbDrop.
    Радиус нужен только для трейла и для сдвига на землю на стороне страницы.
  */
  function solveFrame(b, wheelR, sagOverride) {
    const hta = rad(b.hta), sta = rad(b.sta);
    const htTop = [b.reach, b.stack];
    const u = [Math.cos(hta), -Math.sin(hta)];   // вниз-вперёд вдоль оси рулевой
    const p = [Math.sin(hta), Math.cos(hta)];    // перпендикуляр вперёд (офсет)
    const htBot = [htTop[0] + u[0] * b.ht, htTop[1] + u[1] * b.ht];
    const rear = [-Math.sqrt(Math.max(b.cs * b.cs - b.bbDrop * b.bbDrop, 1)), b.bbDrop];
    const stTop = [-b.st * Math.cos(sta), b.st * Math.sin(sta)];

    // Паспортная передняя ось всегда лежит на высоте bbDrop (оба колеса на земле).
    // Не хватает одного числа: либо колёсная база, либо офсет вилки.
    let front, dRef, oRef;
    if (b.wb) {
      front = [b.wb + rear[0], b.bbDrop];
      const fk = [front[0] - htBot[0], front[1] - htBot[1]];
      dRef = fk[0] * u[0] + fk[1] * u[1];
      oRef = fk[0] * p[0] + fk[1] * p[1];
    } else {
      oRef = (b.offset != null ? b.offset : 44);
      dRef = (b.bbDrop - htBot[1] - oRef * p[1]) / u[1];
      front = [htBot[0] + u[0] * dRef + p[0] * oRef, htBot[1] + u[1] * dRef + p[1] * oRef];
    }

    const sagMM = b.travel * ((sagOverride != null ? sagOverride : (b.sag || 0)) / 100);

    /* Замена вилки. По умолчанию модель считает, что A2C растёт 1:1 с ходом, а офсет
       не меняется — это верно для «накрутил ход на той же вилке» и неверно при смене
       модели: у двух 140-х вилок A2C расходится на 10 мм.
       Если заданы A2C обеих вилок, берём их РАЗНОСТЬ. Именно разность, а не абсолют:
       dRef меряется от низа рулевого стакана, а A2C — от посадочного места кольца
       короны, которое ниже на высоту нижней чашки. Эта неизвестная константа в
       разности сокращается, поэтому знать её не нужно, а заодно неважно, меряет ли
       производитель A2C по прямой или вдоль оси штока. Офсет абсолютный. */
    const dA2C = (b.forkA2C != null && b.forkA2Cnew != null) ? (b.forkA2Cnew - b.forkA2C)
                                                             : (b.travel - b.travelRef);
    const oNew = (b.forkOffsetNew != null) ? b.forkOffsetNew : oRef;
    const dNew = dRef + dA2C - sagMM;
    const fkNew = [u[0] * dNew + p[0] * oNew, u[1] * dNew + p[1] * oNew];

    // поворот рамы вокруг задней оси до касания земли передним колесом
    const W = [htBot[0] - rear[0] + fkNew[0], htBot[1] - rear[1] + fkNew[1]];
    const th = -Math.atan2(W[1], W[0]);          // > 0 => нос поднимается
    const rot = q => {
      const dx = q[0] - rear[0], dy = q[1] - rear[1];
      return [rear[0] + dx * Math.cos(th) - dy * Math.sin(th),
              rear[1] + dx * Math.sin(th) + dy * Math.cos(th)];
    };
    const P = {
      BB: rot([0, 0]), htTop: rot(htTop), htBot: rot(htBot), stTop: rot(stTop),
      rear: rear.slice(),
      front: [rear[0] + W[0] * Math.cos(th) - W[1] * Math.sin(th),
              rear[1] + W[0] * Math.sin(th) + W[1] * Math.cos(th)]
    };

    const htaN = deg(Math.atan2(P.htTop[1] - P.htBot[1], P.htBot[0] - P.htTop[0]));
    const staN = deg(Math.atan2(P.stTop[1] - P.BB[1], P.BB[0] - P.stTop[0]));

    return {
      P, hta: htaN, sta: staN,
      reach: P.htTop[0] - P.BB[0],
      stack: P.htTop[1] - P.BB[1],
      bbDrop: P.rear[1] - P.BB[1],
      wb: P.front[0] - P.rear[0],
      theta: deg(th),
      dRef, oRef, dNew, oNew, dA2C, sagMM, wheelR,
      a2cRef: Math.hypot(dRef, oRef),
      a2cNew: Math.hypot(dNew, oNew),
      trail: (wheelR / Math.tan(rad(htaN))) - oNew / Math.sin(rad(htaN))
    };
  }

  /* Паспортная колёсная база из офсета — когда база не задана. Той же формулой,
     что и ветка «базы нет» в solveFrame, иначе числа разъедутся. */
  function passportWB(b) {
    if (b.wb) return b.wb;
    const hta = rad(b.hta);
    const u = [Math.cos(hta), -Math.sin(hta)], p = [Math.sin(hta), Math.cos(hta)];
    const htBot = [b.reach + u[0] * b.ht, b.stack + u[1] * b.ht];
    const rearX = -Math.sqrt(Math.max(b.cs * b.cs - b.bbDrop * b.bbDrop, 1));
    const o = (b.offset != null ? b.offset : 44);
    const d = (b.bbDrop - htBot[1] - o * p[1]) / u[1];
    return (htBot[0] + u[0] * d + p[0] * o) - rearX;
  }

  /* Серийный ряд офсетов вилок 29". Нужен, чтобы сказать «ближайший бывающий». */
  const FORK_OFFSETS = [37, 42, 44, 46, 51];

  /*
    forkInverse(b, wheelR, spec) — обратная задача к solveFrame.

    Прямая задача выводит вилку из геометрии. Но у выведенных чисел есть
    неприятное свойство: они по-разному чувствительны к замерам.

      угол рулевой  +0.5°  ->  офсет +5.8 мм,  длина +0.1 мм
      длина стакана +5 мм  ->  офсет  0.0 мм,  длина −5.0 мм
      всё остальное        ->  двигает оба

    То есть офсет читает почти исключительно угол рулевой, а длина — всё
    остальное. Это делает их двумя независимыми проверками одного набора
    замеров, и именно поэтому есть смысл считать обратно.

    Офсет вилки обычно известен из спецификации, а угол рулевой — самое
    трудное для самостоятельного замера число: телефонный уровень даёт ±0.5°,
    а это ±6 мм офсета. Поэтому «известный офсет -> какой угол из него следует»
    точнее, чем мерить угол телефоном.

    spec = { offset, len }, оба необязательны:
      offset — офсет вилки по спецификации, мм
      len    — замер рулеткой от низа чашки рулевой до оси переднего колеса, мм

    Модель отмеряет вилку от НИЗА РУЛЕВОГО СТАКАНА, а чашка стоит ниже него.
    Поэтому замер обязан быть больше расчёта, и разница — это высота нижнего
    узла, выступающего из стакана. Отрицательная разница означает ошибку
    в замерах рамы, а не в вилке.
  */
  function forkInverse(b, wheelR, spec) {
    spec = spec || {};
    const r0 = solveFrame(b, wheelR, 0);
    const out = {
      oRef: r0.oRef, dRef: r0.dRef, a2cRef: r0.a2cRef,
      derived: !!b.wb,                 // офсет выведен, а не введён руками
      near: FORK_OFFSETS.reduce((a, c) => Math.abs(c - r0.oRef) < Math.abs(a - r0.oRef) ? c : a),
      htaFromOffset: null, dHta: null,
      lenGap: null,
      sens: {}
    };

    // чувствительности: насколько сдвигают офсет и длину типичные ошибки замера
    const probe = { reach: 1, stack: 1, hta: 0.1, ht: 1, cs: 1, bbDrop: 1, wb: 1 };
    for (const k in probe) {
      if (b[k] == null) continue;
      const r = solveFrame({ ...b, [k]: b[k] + probe[k] }, wheelR, 0);
      out.sens[k] = { step: probe[k], o: r.oRef - r0.oRef, len: r.a2cRef - r0.a2cRef };
    }

    /* Угол, при котором выведенный офсет равен заявленному. Ищем бисекцией:
       офсет по углу монотонен и почти линеен, ±5° с запасом перекрывают
       любую реальную ошибку замера. Имеет смысл только когда офсет выводится,
       то есть задана колёсная база; иначе он просто равен введённому. */
    if (spec.offset != null && b.wb) {
      const f = h => solveFrame({ ...b, hta: h }, wheelR, 0).oRef - spec.offset;
      let lo = b.hta - 5, hi = b.hta + 5;
      if (f(lo) * f(hi) <= 0) {
        for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; (f(lo) * f(m) <= 0 ? hi = m : lo = m); }
        out.htaFromOffset = (lo + hi) / 2;
        out.dHta = out.htaFromOffset - b.hta;
        out.lenAtThatHta = solveFrame({ ...b, hta: out.htaFromOffset }, wheelR, 0).a2cRef;
      }
    }

    if (spec.len != null) out.lenGap = spec.len - r0.a2cRef;
    return out;
  }

  /*
    forkReport — словами то, что посчитал forkInverse.

    Возвращает массив {kind, text}:
      info — базовый вывод, что вообще следует из геометрии;
      note — найденный ответ на заданный вопрос, ради которого всё и затевалось;
      warn — расхождение, которое стоит проверить;
      bad  — противоречие, которого не может быть физически.
  */
  function forkReport(b, wheelR, spec) {
    const F = forkInverse(b, wheelR, spec);
    const n1 = v => v.toFixed(1), sgn = v => (v >= 0 ? '+' : '') + v.toFixed(1);
    const out = [];

    out.push({ kind: 'info', text:
      `Из введённой геометрии следует вилка: осевая длина от низа стакана ${n1(F.dRef)} мм, ` +
      `по прямой до оси ${n1(F.a2cRef)} мм, офсет ${n1(F.oRef)} мм.` +
      (F.derived ? '' : ' Офсет введён вручную, а не выведен: без колёсной базы проверять нечего.') });

    // сверка с серийным рядом — работает и без всяких дополнительных полей
    if (F.derived && spec && spec.offset == null) {
      const gap = F.oRef - F.near;
      if (Math.abs(gap) >= 2) {
        const bad = F.oRef < 34 || F.oRef > 54;
        const dW = F.sens.wb ? -gap / (F.sens.wb.o / F.sens.wb.step) : null;
        out.push({ kind: bad ? 'bad' : 'warn', text:
          `Ближайший серийный офсет — ${F.near} мм, расхождение ${sgn(gap)}. ` +
          (bad ? 'Такого офсета не выпускают (ряд 37–51), так что ошибка точно в замерах. ' : '') +
          (dW ? `Столько даёт ошибка колёсной базы примерно в ${Math.abs(dW).toFixed(0)} мм` : '') +
          (F.sens.hta ? `, или ${Math.abs(gap / (F.sens.hta.o / F.sens.hta.step)).toFixed(1)}° по углу рулевой` : '') +
          '. Если офсет вилки известен, впиши его ниже — тогда проверка станет однозначной.' });
      }
    }

    // главное: известный офсет -> угол рулевой
    if (spec && spec.offset != null) {
      if (!F.derived) {
        out.push({ kind: 'warn', text:
          'Чтобы вывести угол из офсета, нужна колёсная база: без неё офсет сам является входом.' });
      } else if (spec.offset < 30 || spec.offset > 60) {
        /* Угол под такой офсет формально найдётся — уравнение решается для любого
           числа, — но он ничего не значит. Отсекаем до расчёта, чтобы блок
           одинаково ругался и на слишком маленький офсет, и на слишком большой. */
        out.push({ kind: 'bad', text:
          `Офсет ${spec.offset} мм не бывает у серийных вилок: ряд 37–51, за его пределами встречаются разве что ` +
          'единичные модели до 60. Проверь число — угол, который из него следует, смысла не имеет.' });
      } else if (F.htaFromOffset == null) {
        out.push({ kind: 'bad', text:
          `Офсет ${spec.offset} мм не получается ни при каком угле рулевой в пределах ±5° от введённого. ` +
          'Значит ошибка не в угле, а в базе, reach, стеке или перьях.' });
      } else {
        const per = F.sens.hta ? Math.abs(F.sens.hta.o) : 0;
        out.push({ kind: Math.abs(F.dHta) > 1 ? 'warn' : 'note', text:
          `При офсете ${spec.offset} мм угол рулевой должен быть ${F.htaFromOffset.toFixed(2)}° — ` +
          `введено ${b.hta}°, расхождение ${sgn(F.dHta)}°. ` +
          `Угол здесь и есть главный подозреваемый: 0.1° стоит ${per.toFixed(1)} мм офсета, ` +
          `а телефонный уровень врёт как раз на полградуса. ` +
          `Длина вилки при этом почти не меняется — ${n1(F.lenAtThatHta)} мм против ${n1(F.a2cRef)}, ` +
          `так что вторая проверка от этой правки не зависит.` });
      }
    }

    // вторая, независимая проверка: замер рулеткой
    if (spec && spec.len != null) {
      const g = F.lenGap;
      if (g < 0) {
        /* Насколько надо подвинуть каждый замер, чтобы длина сошлась с запасом
           на нижний узел в 4 мм. Знак важен: одни замеры длину растят, другие
           укорачивают, и «минус 9 по стеку» — совсем не то же, что «плюс 9». */
        const cand = [];
        for (const [k, lbl] of [['stack','стек'],['wb','базу'],['reach','reach'],['ht','длину стакана'],['bbDrop','BB drop'],['cs','перья']]) {
          const s = F.sens[k]; if (!s || Math.abs(s.len) < 1e-6) continue;
          const need = (g - 4) / (s.len / s.step);
          cand.push(`${lbl} ${need > 0 ? 'больше' : 'меньше'} на ${Math.abs(need).toFixed(0)} мм`);
        }
        out.push({ kind: 'bad', text:
          `Замер ${spec.len} мм меньше расчётных ${n1(F.a2cRef)} на ${Math.abs(g).toFixed(1)} мм — так быть не может. ` +
          'Чашка рулевой стоит НИЖЕ стакана, поэтому замер обязан быть больше расчёта, а не меньше. ' +
          `Чтобы сойтись с запасом на нижний узел в 4 мм, нужно ${cand.slice(0,3).join(', либо ')}.` });
      } else if (g > 12) {
        out.push({ kind: 'warn', text:
          `Замер ${spec.len} мм больше расчётных ${n1(F.a2cRef)} на ${g.toFixed(1)} мм. ` +
          'Столько нижний узел рулевой из стакана обычно не выступает — бывает 3–7 мм. Проверь замер или геометрию.' });
      } else {
        out.push({ kind: 'note', text:
          `Замер ${spec.len} мм против расчётных ${n1(F.a2cRef)}: нижний узел рулевой выступает из стакана на ${g.toFixed(1)} мм. ` +
          'Это нормально, обычно 3–7 мм. Если ставишь другую вилку с иначе сидящим подшипником, эту разницу надо учесть отдельно: ' +
          'модель считает, что она одинакова у обеих вилок и потому сокращается.' });
      }
    }
    // блок замены вилки: он рядом и читается вместе с проверкой
    if (b.forkA2C != null && b.forkA2Cnew != null) {
      const d = b.forkA2Cnew - b.forkA2C;
      out.push({ kind: 'info', text:
        `Замена вилки считается по разности A2C: ${d > 0 ? '+' : ''}${d.toFixed(0)} мм` +
        (b.forkOffsetNew != null ? `, офсет ${b.forkOffsetNew}` : ', офсет прежний') + '.' });
    } else if (b.forkA2C != null || b.forkA2Cnew != null) {
      out.push({ kind: 'warn', text:
        'Заполнено только одно A2C — нужны оба, иначе замена вилки считается по ходу.' });
    }
    return out;
  }

  /*
    Готовая разметка блока. Казалось бы, это дело страницы — но именно из-за
    «пусть каждая соберёт сама» блок и разъехался: у fit-lab свой класс .warn
    (жёлтая плашка с отступами), у index свой (display:none). Одинаковый вывод
    надёжнее получить из одного места, а классы взять с префиксом, которого
    на страницах заведомо нет.

    Каждый пункт — отдельной строкой: так найденный ответ видно сразу,
    а не приходится выцеплять его из сплошного серого абзаца.
  */
  function forkReportHTML(b, wheelR, spec) {
    const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    return forkReport(b, wheelR, spec)
      .map(x => `<div class="fk-${x.kind}">${esc(x.text)}</div>`).join('');
  }

  global.BikeModel = { rad, deg, solveFrame, passportWB,
                       forkInverse, forkReport, forkReportHTML, FORK_OFFSETS };

})(typeof globalThis !== 'undefined' ? globalThis : this);
