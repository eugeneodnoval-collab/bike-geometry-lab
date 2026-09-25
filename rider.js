/*
  Нога райдера и высота седла от угла колена. Одна цепочка на все страницы.

  Жила внутри fit-lab.html (segments и solveFit). Вынесена, когда понадобилась
  профилю рамы: сравнение геометрий оценивает, с какого роста седло вообще
  опускается до здоровой высоты, — а это та же цепочка «каретка → педаль в НМТ →
  голеностоп → колено под целевым углом → таз → седло». Копия на второй странице
  разошлась бы с Fit Lab так же, как когда-то разошлись две копии солвера рамы.

  Классический скрипт, не модуль — по той же причине, что model.js: file://.

  Состояния страницы здесь нет: мерки, железо и рама приходят аргументами.
  Торс, руки, стойка и всё остальное тело остались в Fit Lab.
*/
(function (global) {
  'use strict';

  const rad = d => d * Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Зоны угла колена в нижней мёртвой точке: зелёная и жёлтая. Их показывает
     таблица посадки Fit Lab, и по верхней границе зелёной профиль рамы решает,
     что седло стоит слишком высоко. */
  const KNEE_BDC = { good: [138, 152], ok: [130, 160] };

  /* Мерки и железо, которые Fit Lab ставит, пока их не ввели. Профиль рамы
     считает по ним «типичного» райдера: своих мерок у сравнения нет. Совпадение
     с начальным состоянием Fit Lab сторожит регресс. */
  const TYP = { soleThk: 18, pedalStack: 8, femurPct: 50, hipAbove: 35, hipFwd: 25, crank: 170 };

  /* Сколько штырь и седло занимают над торцом подседельной трубы, когда седло
     опущено до предела, мм. Паспортная длина трубы — до торца, воротник стоит на нём.
     • rigid — голова жёсткого штыря от торца до центра рельс: штырь садится
       в трубу, пока голова не упрётся в хомут, у ходовых моделей 20–30;
     • dropper — стек дроппера от низа воротника до центра рельс, штырь сжат:
       30 у OneUp V3, самого низкого из ходовых, у Fox Transfer 60. Над трубой
       дроппер занимает стек плюс ход — при езде он выдвинут полностью;
     • saddle — седло от центра рельс до точки опоры, у ходовых моделей 40–55.
     Берутся самые низкие варианты, поэтому выводы из них мягкие: с другим штырём
     седло опускается хуже, а не лучше. Этими числами Fit Lab проверяет, влезает ли
     штырь под подобранное седло, а профиль рамы — с какого роста седло опускается. */
  const POST = { rigid: 25, dropper: 30, saddle: 45 };
  // самое низкое седло над торцом трубы: жёсткий штырь (drop = 0) или дроппер хода drop
  const minAbove = drop => (drop ? POST.dropper + drop : POST.rigid) + POST.saddle;
  // самый длинный дроппер, который влезает, когда седло над торцом трубы на ext
  const maxDropper = ext => ext - POST.dropper - POST.saddle;

  /* Нога из мерок. b — мерки тела как их хранит Fit Lab (height, inseam, ankleH,
     soleThk, femurLen, tibiaLen, femurPct, footLen, heelToMet, pedalPos);
     pedStack — платформа педали, она железо и живёт в кокпите. */
  function leg(b, pedStack) {
    const H = b.height, I = b.inseam;
    // inseam меряется босиком, поэтому длину ноги считаем от БОСОЙ высоты голеностопа.
    // Подошва обуви только поднимает стопу над осью педали и потому поднимает седло 1:1.
    const ankleBare = (b.ankleH != null ? b.ankleH : 0.039 * H);
    const ankleH = ankleBare + b.soleThk + pedStack;                 // голеностоп над ОСЬЮ педали
    const hipJointH = I + 0.055 * H;                                 // головка бедра над полом
    const legTotal = Math.max(hipJointH - ankleBare, 200);
    /* Каждый сегмент: прямой замер, если введён, иначе антропометрическая доля.
       Доли Winter — средние по популяции, поэтому прямые замеры всегда в приоритете. */
    const femur = b.femurLen != null ? b.femurLen
                : b.tibiaLen != null ? Math.max(legTotal - b.tibiaLen, 150)
                : legTotal * (b.femurPct / 100);
    const tibia = b.tibiaLen != null ? b.tibiaLen : Math.max(legTotal - femur, 150);
    /* Стопа: лодыжка стоит позади оси педали. Ось по умолчанию под 1-й плюсневой;
       кто катает серединой стопы, ставит меньше. На высоту седла влияет слабо
       (сдвиг почти горизонтальный), но задаёт рисунок и продольное положение колена. */
    const footLen   = b.footLen   != null ? b.footLen   : 0.152 * H;
    const heelToMet = b.heelToMet != null ? b.heelToMet : 0.685 * footLen;
    const pedalPos  = b.pedalPos  != null ? b.pedalPos  : heelToMet;
    const ankleFromHeel = 0.33 * footLen;                            // проекция голеностопа от пятки
    const pedalBackAuto = clamp(pedalPos - ankleFromHeel, -60, 260);
    return { ankleBare, ankleH, hipJointH, legTotal, femur, tibia,
             footLen, heelToMet, pedalPos, ankleFromHeel, pedalBackAuto };
  }

  /* Педаль и голеностоп при угле шатуна crankDeg (0 — вверх, 180 — вниз);
     side ±1 — сторона, поперёк рамы на полширины Q-factor. pedalUp/pedalBack —
     голеностоп над осью педали и позади неё, уже с наклоном подошвы. */
  function foot(BB, crank, qFactor, pedalUp, pedalBack, crankDeg, side) {
    const t = rad(crankDeg);
    const ped = [BB[0] + crank * Math.sin(t), side * qFactor / 2, BB[1] + crank * Math.cos(t)];
    return { ped, ank: [ped[0] - pedalBack, ped[1], ped[2] + pedalUp] };
  }

  /* Высота седла: подбираем так, чтобы в НМТ колено дало целевой угол. Так длина
     шатуна работает физически, а не через поправку.
     BB и sta — каретка и угол подседельной рамы; ank — голеностоп в НМТ (foot);
     o — femur, tibia, knee, setback (сетбек седла от оси трубы), hipFwd, hipAbove.
     satH — ход вдоль оси подседельной трубы от каретки до точки опоры на седле:
     именно его сравнивают с длиной трубы. */
  function saddle(BB, staDeg, ank, o) {
    const need = Math.sqrt(o.femur ** 2 + o.tibia ** 2 - 2 * o.femur * o.tibia * Math.cos(rad(o.knee)));
    const sta = rad(staDeg);
    const hipOf = q => [q[0] + o.hipFwd, 0, q[1] + o.hipAbove];
    const seatAt = m => [BB[0] - m * Math.cos(sta) - o.setback, BB[1] + m * Math.sin(sta)];
    let lo = 300, hi = 1100;
    for (let i = 0; i < 70; i++) {
      const m = (lo + hi) / 2, hp = hipOf(seatAt(m));
      (Math.hypot(hp[0] - ank[0], hp[2] - ank[2]) < need) ? lo = m : hi = m;
    }
    const satH = (lo + hi) / 2, sat = seatAt(satH);
    return { satH, sat, hip: hipOf(sat) };
  }

  global.BikeRider = { KNEE_BDC, TYP, POST, minAbove, maxDropper, leg, foot, saddle };

})(typeof globalThis !== 'undefined' ? globalThis : this);
