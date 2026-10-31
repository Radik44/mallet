// The scripts of the guided tours: the short "first steps" tour, the full
// lesson for someone who never opened Hammer, and the short one for a
// Hammer veteran. Every step names what to spotlight; the deeds (draw a
// brush, apply a texture…) tick themselves off from the editor's state,
// the rest is explained and moves on by "Дальше". Texts are one or two
// short sentences: the card is read in a glance, the detail is in the guide.

import type { TourStep } from "./Tour";
import { t } from "../i18n";

export type TourKind = "quick" | "full" | "hammer";

/** What the scripts look at to tick their deeds off. */
export interface TourState {
  hasMap: boolean;
  tool: string;
  texturesShown: boolean;
  brush: boolean;
  texture: boolean;
  entity: boolean;
  compile: boolean;
  inTauri: boolean;
  gameFound: boolean;
}

const T = (id: string, target: string | null, title: string, text: string, extra: Partial<TourStep> = {}): TourStep => ({ id, target, title, text, ...extra });

/** The deeds shared by the quick tour and the full lesson. */
function deeds(st: TourState): Record<string, TourStep> {
  return {
    newMap: T(
      "new",
      '[data-tour="new-map"], [data-cmd="new"]',
      t("Создайте карту"),
      t("«Новая карта» создаёт готовую комнату со светом и точкой появления, которую можно сразу собрать и запустить."),
      { done: st.hasMap },
    ),
    block: T("block", '.tool-rail [data-tool="block"]', t("Инструмент «Блок»"), t("Создаёт браши: стены, полы, ящики. Нажмите кнопку на панели слева или клавишу 2."), {
      done: st.tool === "block" || st.brush,
    }),
    draw: T("draw", '[data-view="top"]', t("Нарисуйте браш"), t("В виде сверху протяните рамку левой кнопкой мыши и нажмите Enter."), { done: st.brush }),
    textures: T("textures", '[data-tab="textures"]', t("Откройте «Текстуры»"), t("Вкладка справа. Щелчок по плитке делает материал текущим."), { done: st.texturesShown || st.texture }),
    apply: T("apply", '[data-tour="apply-texture"]', t("Примените текстуру"), t("Выделите браш и нажмите «На выделение» либо перетащите плитку на грань в 3D-виде."), { done: st.texture }),
    entity: T("entity", '.tool-rail [data-tool="entity"]', t("Инструмент «Энтити»"), t("Размещает свет, пропы, точки появления и двери. Кнопка на панели слева или клавиша 4."), {
      done: st.tool === "entity" || st.entity,
    }),
    place: T("place", '[data-view="3d"]', t("Поставьте энтити"), t("Выберите класс в строке сверху и щёлкните по полу в 3D-виде."), { done: st.entity }),
    compile: T("compile", '[data-cmd="compile"]', t("Соберите карту"), t("Кнопка с молотком справа вверху или F9. Ошибки появятся в панели «Сборка» со ссылками на место."), { done: st.compile }),
    play: T("play", '[data-cmd="game"]', t("Запустите игру"), t("Зелёная кнопка запускает Garry's Mod на этой карте."), { done: false }),
  };
}

export function quickTour(st: TourState): TourStep[] {
  const d = deeds(st);
  return [d.newMap, d.block, d.draw, d.textures, d.apply, d.entity, d.place, d.compile, d.play];
}

/** The whole editor from the first window to the running game, for someone new to mapping. */
export function fullLesson(st: TourState): TourStep[] {
  const d = deeds(st);
  const game = st.inTauri
    ? st.gameFound
      ? t("Garry's Mod найден, текстуры и модели игры загружаются.")
      : t("Garry's Mod не найден: редактор работает без текстур и моделей игры.")
    : t("В браузере контент игры недоступен; приложение загружает его из Steam.");
  return [
    T(
      "intro",
      null,
      t("Добро пожаловать"),
      t("Обучение охватывает окно, камеру, инструменты, сборку и запуск игры. Шаги с действием завершаются автоматически после его выполнения; Esc прерывает обучение. {0}", [game]),
      { panel: "textures", chapter: t("Введение") },
    ),
    { ...d.newMap, chapter: t("Введение") },
    T("menubar", ".menubar", t("Меню"), t("Все команды редактора с сочетаниями клавиш. Их также можно найти по названию в палитре команд (F1)."), { chapter: t("Окно") }),
    T("toolbar", ".toolbar", t("Панель кнопок"), t("Частые действия: файл, отмена, удаление, группы, скрытие и показ, сетка. Справа - сборка и запуск игры."), { chapter: t("Окно") }),
    T("rail", ".tool-rail", t("Инструменты"), t("Восемь инструментов на панели слева, клавиши 1–8. Стрелка внизу сворачивает панель до значков."), { chapter: t("Окно") }),
    T("views", ".views", t("Четыре вида"), t("3D-вид и три проекции: сверху, спереди, сбоку. Перетащите заголовок, чтобы поменять виды местами; двойной щелчок разворачивает вид."), {
      chapter: t("Окно"),
    }),
    T("dock", ".dock-right", t("Панели справа"), t("Пять групп вкладок: Инспектор, Библиотека, Карта, Сборка, Ассистент. Вкладки можно перетаскивать между зонами и в отдельные окна."), {
      chapter: t("Окно"),
    }),
    T("ctx", ".context-bar", t("Контекстная строка"), t("Параметры текущего инструмента: для «Выбора» - перемещение, поворот, масштаб и создание энтити, для «Блока» - форма, для «Энтити» - класс."), {
      chapter: t("Окно"),
    }),
    T("status", "footer.bar", t("Строка состояния"), t("Состояние редактора, размер карты, шаг сетки и выделение. Кнопка «?» справа открывает справку по мыши и клавишам."), { chapter: t("Окно") }),
    T(
      "cam3d",
      '[data-view="3d"]',
      t("Камера в 3D"),
      t("Удерживайте среднюю кнопку мыши, чтобы осматриваться; W, A, S, D перемещают камеру, Shift ускоряет. Правая кнопка открывает контекстное меню объекта."),
      { chapter: t("Камера") },
    ),
    T("cam2d", '[data-view="top"]', t("Камера в 2D"), t("Средняя кнопка панорамирует, колесо масштабирует. Ctrl+E наводит все виды на выделение."), { chapter: t("Камера") }),
    { ...d.block, chapter: t("Браши") },
    { ...d.draw, chapter: t("Браши") },
    T("grid", '[data-cmd="grid-up"]', t("Сетка"), t("Браши привязываются к сетке; [ и ] меняют её шаг. Alt при перемещении отключает привязку."), { chapter: t("Браши") }),
    T("select", '.tool-rail [data-tool="select"]', t("Инструмент «Выбор»"), t("Щелчок выделяет объект, рамка в 2D - несколько объектов. Стрелки гизмо перемещают, R переключает поворот и масштаб."), {
      chapter: t("Браши"),
    }),
    T("ctxsel", ".context-bar", t("Полые блоки и энтити"), t("Ctrl+H превращает блок в комнату со стенами заданной толщины, Ctrl+T - браши в дверь, триггер или func_detail."), {
      chapter: t("Браши"),
    }),
    T("inspector", '[data-tab="inspector"]', t("Инспектор"), t("Сведения о выделении: точные положение и размер, материалы, свойства энтити. Открывается автоматически при выделении."), {
      panel: "inspector",
      chapter: t("Браши"),
    }),
    { ...d.textures, chapter: t("Текстуры") },
    { ...d.apply, chapter: t("Текстуры") },
    T(
      "textool",
      '.tool-rail [data-tool="texture"]',
      t("Инструмент «Текстура»"),
      t("Щелчок по грани применяет к ней текущий материал, с Shift - ко всему брашу, Alt+щелчок берёт материал с грани. Карточка граней сдвигает и выравнивает текстуру."),
      { chapter: t("Текстуры") },
    ),
    { ...d.entity, chapter: t("Энтити") },
    { ...d.place, chapter: t("Энтити") },
    T("properties", '[data-tab="properties"]', t("Свойства энтити"), t("Ключи с подсказками и вкладка «Выходы» для связей I/O: например, кнопка открывает дверь, а триггер включает свет."), {
      panel: "properties",
      chapter: t("Энтити"),
    }),
    T("models", '[data-tab="models"]', t("Модели"), t("Выберите модель, и её предпросмотр появится под курсором в 3D-виде: щелчок ставит проп, протяжка выкладывает ряд."), {
      panel: "models",
      chapter: t("Энтити"),
    }),
    T("clip", '.tool-rail [data-tool="clip"]', t("Разрез"), t("Проведите линию через браш в 2D и нажмите Enter, чтобы разрезать его: так делают проёмы и скосы."), { chapter: t("Инструменты") }),
    T("vertex", '.tool-rail [data-tool="vertex"]', t("Вершины"), t("Перемещение вершин и рёбер брашей: скаты крыш, наклонные стены."), { chapter: t("Инструменты") }),
    T(
      "generator",
      '[data-tab="inspector"]',
      t("Параметрические фигуры"),
      t("Цилиндр, сфера, арка и лестница из инструмента «Блок» остаются редактируемыми: карточка «Генератор» в инспекторе меняет стороны, стенку, дугу или ступень."),
      { chapter: t("Инструменты"), panel: "inspector" },
    ),
    T(
      "vsnap",
      '[data-view="top"]',
      t("Привязка к вершинам"),
      t("Зажмите V во время переноса в 2D-виде: вершина выделения ляжет точно на вершину другого объекта. Shift стыкует с соседом, Ctrl клонирует."),
      { chapter: t("Инструменты") },
    ),
    T("prefabs", '[data-tab="prefabs"]', t("Префабы"), t("Сохраните выделение как префаб, чтобы вставлять его в любую карту."), { chapter: t("Инструменты"), panel: "prefabs" }),
    T(
      "outliner",
      '[data-tab="outliner"]',
      t("Структура"),
      t("Карта деревом: мир, группы, энтити по классам и родителям. Глаз скрывает, замок блокирует, перетаскивание энтити на другую делает её дочерней."),
      { chapter: t("Инструменты"), panel: "outliner" },
    ),
    T("logic", '[data-tab="logic"]', t("Логика"), t("Связи энтити графом: узлы и линии «выход → вход». Тяните из порта узла на другой узел, чтобы добавить связь; битые имена показаны красным."), {
      chapter: t("Инструменты"),
      panel: "logic",
    }),
    T("visgroups", '[data-tab="visgroups"]', t("Визгруппы"), t("H скрывает выделенное, U показывает всё. Скрытые объекты не мешают работе, но попадают в сборку."), {
      panel: "visgroups",
      chapter: t("Инструменты"),
    }),
    { ...d.compile, chapter: t("Сборка") },
    T("visleaves", '[data-tab="compile"]', t("Визлифы"), t("После сборки кнопка «Визлифы» раскрашивает листья видимости от зелёного к красному: красные места дороги для VVIS и для игры."), {
      chapter: t("Сборка"),
      panel: "compile",
    }),
    T("compiletab", '[data-tab="compile"]', t("Панель «Сборка»"), t("Пресеты «Быстрая», «Полная» и «Своя». После сборки блок «Анализ лога» объясняет ошибки и автоматически исправляет известные."), {
      panel: "compile",
      chapter: t("Сборка"),
    }),
    { ...d.play, chapter: t("Сборка"), done: undefined },
    T("bridge", '[data-tab="compile"]', t("Мост с игрой"), t("Пока игра запущена, доступны телепорт к выделению, «Взгляд из игры» и живая синхронизация энтити."), {
      panel: "compile",
      chapter: t("Сборка"),
    }),
    T("save", '[data-cmd="save"]', t("Сохранение"), t("Ctrl+S сохраняет карту. Автосохранение выполняется каждые две минуты, история версий - в «Карта → История»."), { chapter: t("Завершение") }),
    T(
      "history",
      '[data-tab="history"]',
      t("История и правки"),
      t("Все шаги отмены списком - щелчок возвращает к любому; сохранённые версии сравниваются с открытой картой пообъектно, объект можно вернуть из версии."),
      { chapter: t("Завершение"), panel: "history" },
    ),
    T("help", '[data-tour="palette"]', t("Поиск команд"), t("F1 открывает палитру команд: введите название действия. Меню «Справка» снова открывает «Первые шаги» и это обучение."), {
      chapter: t("Завершение"),
    }),
    T("bye", null, t("Обучение завершено"), t("Основы освоены: геометрия, текстуры, свет и пропы, сборка и запуск. Начните с небольшой карты и доведите её до запуска в игре."), {
      chapter: t("Завершение"),
      final: true,
    }),
  ];
}

/** What differs from Hammer, for someone who already maps. */
export function hammerLesson(st: TourState): TourStep[] {
  return [
    T("intro", null, t("Для пользователей Hammer"), t("Формат тот же: VMF, FGD, VBSP, VVIS и VRAD из игры. Отличаются интерфейс и некоторые приёмы работы; обзор займёт около пяти минут."), {
      chapter: t("Введение"),
    }),
    T("rail", ".tool-rail", t("Инструменты: клавиши 1–8"), t("Клавиши 1–8 вместо Shift+буква: Shift ускоряет камеру. Раскладка клавиш Hammer уже включена."), { chapter: t("Клавиши") }),
    T("cam", '[data-view="3d"]', t("Камера"), t("Свободная камера - на средней кнопке мыши, а не на Z. Правая кнопка открывает контекстное меню объекта."), { chapter: t("Клавиши") }),
    T("views", ".views", t("Виды"), t("Виды перетаскиваются за заголовок, разворачиваются двойным щелчком и открываются в отдельном окне."), { chapter: t("Окно") }),
    T("dock", ".dock-right", t("Панели вместо диалогов"), t("Object Properties, Face Edit и браузеры - это вкладки справа. Инспектор показывает все сведения о выделении."), { chapter: t("Окно") }),
    T("gizmo", '.tool-rail [data-tool="select"]', t("Гизмо вместо маркеров"), t("В 3D - стрелки, кольца и кубы, R переключает режим. В 2D - привычные маркеры рамки."), { chapter: t("Правка") }),
    T(
      "textures",
      '[data-tab="textures"]',
      t("Текстуры перетаскиванием"),
      t("Плитку материала можно перетащить на грань в 3D с предпросмотром. Face Edit заменён карточкой граней во вкладке «Текстуры»."),
      { panel: "textures", chapter: t("Правка") },
    ),
    T("compile", '[data-tab="compile"]', t("Сборка"), t("Run Map с пресетами и анализом лога: линия утечки, порталы, упаковка контента."), { chapter: t("Сборка") }),
    T("bridge", '[data-cmd="game"]', t("Мост с игрой"), t("Телепорт к выделению, синхронизация камеры в обе стороны, живое перемещение энтити, сборка кубмапов одной кнопкой."), {
      panel: "compile",
      chapter: t("Сборка"),
    }),
    T("decompile", '[data-cmd="open"]', t("Декомпиляция"), t("«Открыть» принимает BSP и возвращает VMF с отчётом о потерях."), { chapter: t("Сборка") }),
    T(
      "beyond",
      '[data-tab="outliner"]',
      t("Чего нет в Hammer"),
      t("«Структура» - дерево карты, «Логика» - граф связей I/O, визлифы после сборки, параметрические арки и лестницы, список шагов отмены и сравнение версий в «Истории», V - привязка к вершинам."),
      { chapter: t("Сборка"), panel: "outliner" },
    ),
    T(
      "bye",
      null,
      t("Обзор завершён"),
      t("Остальное работает как в Hammer. Любую команду можно найти по названию в палитре (F1).{0}", [st.inTauri ? "" : t(" В приложении также доступен контент игры.")]),
      { chapter: t("Завершение"), final: true },
    ),
  ];
}

export function tourScript(kind: TourKind, st: TourState): TourStep[] {
  return kind === "full" ? fullLesson(st) : kind === "hammer" ? hammerLesson(st) : quickTour(st);
}
