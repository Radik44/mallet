// The Claude assistant: the tools the model may call, the loop that runs
// one request (model reply, tool calls, results, until it stops) and a
// canned backend for the browser build and the autotest, which needs no key.

import { currentLocale, languageOf } from "../i18n";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** A content block as the Messages API sends and takes it. */
export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | ResultBlock[]; is_error?: boolean };

/** What a tool result may carry besides text: a picture for the model to look at. */
export type ResultBlock = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface ChatRequest {
  model: string;
  system: string;
  messages: Message[];
  tools: ToolDef[];
  maxTokens?: number;
  /** Which way the shell sends it: "auto" (key, else Claude Code), "api" or "cli". */
  backend?: BackendKind;
}

export type BackendKind = "auto" | "api" | "cli";

export interface ChatResponse {
  content: Block[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * What a streaming backend reports while the reply arrives: text as it is
 * typed, a block starting (a tool call the model is still writing), and a
 * tool call as soon as its block is complete, so it can run at once.
 */
export type StreamDelta =
  { kind: "text"; text: string } | { kind: "block_start"; type: "text" | "tool_use"; name?: string } | { kind: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type Backend = (req: ChatRequest, onDelta?: (d: StreamDelta) => void) => Promise<ChatResponse>;

/** What the tool loop reports as it goes, for the chat log. */
export type AssistantEvent =
  | { kind: "text"; text: string }
  /** Streamed text: a piece of the reply being typed; `text_end` closes it. */
  | { kind: "text_delta"; text: string }
  | { kind: "text_end" }
  /** The model is writing a call to this tool; its input is not complete yet. */
  | { kind: "tool_pending"; name: string }
  | { kind: "tool_start"; name: string; input: Record<string, unknown> }
  | { kind: "tool"; name: string; input: Record<string, unknown>; result: string; error: boolean; edited: boolean; ids?: number[] }
  | { kind: "usage"; inputTokens: number; outputTokens: number }
  | { kind: "error"; text: string };

export interface ToolOutcome {
  result: string;
  /** The map changed: one undo step. */
  edited?: boolean;
  /** Objects the step touched or selected, for the card's "show" button. */
  ids?: number[];
  error?: boolean;
  /** A picture for the model (a game screenshot), base64 without the data: prefix. */
  image?: { mediaType: string; data: string };
}

export interface AssistantContext {
  /** The map as the model should see it at the start of a request. */
  summary(): string;
  runTool(name: string, input: Record<string, unknown>): Promise<ToolOutcome>;
  /** The map since the last request of a living conversation: counts, selection and the steps made since `sinceDepth` undo steps. */
  brief?(sinceDepth: number): string;
  /** Undo steps on the map now. */
  undoDepth?(): number;
}

export const MODELS: { id: string; title: string }[] = [
  { id: "claude-sonnet-5-5", title: "Sonnet 5.5 - быстрее и дешевле" },
  { id: "claude-opus-5-5", title: "Opus 5.5 - точнее, но дороже" },
];

const vec3 = (what: string) => ({ type: "array", items: { type: "number" }, minItems: 3, maxItems: 3, description: what });
const ids = (what: string) => ({ type: "array", items: { type: "integer" }, description: what });

export const TOOLS: ToolDef[] = [
  {
    name: "map_summary",
    description: "Сводка карты: имя, границы, число брашей и энтити, выделение, список энтити с id, классами, именами и позициями. Вызывай первым, если нужны id или размеры.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_entities",
    description: "Энтити карты с id, классом, targetname и origin; можно отфильтровать по классу или имени (подстрока).",
    input_schema: { type: "object", properties: { classname: { type: "string" }, name: { type: "string" } } },
  },
  {
    name: "entity_info",
    description: "Все ключи и выходы (connections) одной энтити по id; для брашевой энтити ещё и её браши.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "create_brush",
    description:
      "Создаёт прямоугольный браш (блок) по минимальному и максимальному углу в юнитах Hammer (Z вверх). Материал - имя из materials без расширения, по умолчанию текущий. Возвращает id браша.",
    input_schema: { type: "object", properties: { min: vec3("минимальный угол x,y,z"), max: vec3("максимальный угол x,y,z"), material: { type: "string" } }, required: ["min", "max"] },
  },
  {
    name: "hollow_brushes",
    description: "Делает браши полыми: комната из коробки. Стенки толщиной thickness (обычно 16) остаются, внутренность вырезается.",
    input_schema: { type: "object", properties: { ids: ids("id брашей"), thickness: { type: "number" } }, required: ["ids"] },
  },
  {
    name: "create_entity",
    description: "Ставит точечную энтити класса classname в origin с ключами из FGD по умолчанию и твоими поверх (например targetname, model, _light, angles). Возвращает id.",
    input_schema: {
      type: "object",
      properties: { classname: { type: "string" }, origin: vec3("позиция x,y,z"), keyvalues: { type: "object", additionalProperties: { type: "string" } } },
      required: ["classname", "origin"],
    },
  },
  {
    name: "tie_to_entity",
    description: "Привязывает браши к новой брашевой энтити (func_door, func_detail, trigger_multiple, func_button…) с ключами. Возвращает id энтити.",
    input_schema: {
      type: "object",
      properties: { ids: ids("id брашей"), classname: { type: "string" }, keyvalues: { type: "object", additionalProperties: { type: "string" } } },
      required: ["ids", "classname"],
    },
  },
  {
    name: "set_entity_keys",
    description: "Меняет ключи энтити: значение null удаляет ключ.",
    input_schema: { type: "object", properties: { id: { type: "integer" }, keyvalues: { type: "object", additionalProperties: { type: ["string", "null"] } } }, required: ["id", "keyvalues"] },
  },
  {
    name: "add_connections",
    description: "Добавляет выходы (I/O) энтити: output (например OnPressed), target (targetname), input (например Open), parameter, delay в секундах, times (-1 - без ограничений).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        connections: {
          type: "array",
          items: {
            type: "object",
            properties: { output: { type: "string" }, target: { type: "string" }, input: { type: "string" }, parameter: { type: "string" }, delay: { type: "number" }, times: { type: "integer" } },
            required: ["output", "target", "input"],
          },
        },
      },
      required: ["id", "connections"],
    },
  },
  {
    name: "set_material",
    description: "Кладёт материал на все грани брашей с этими id.",
    input_schema: { type: "object", properties: { ids: ids("id брашей"), material: { type: "string" } }, required: ["ids", "material"] },
  },
  {
    name: "move_objects",
    description: "Сдвигает объекты (браши и энтити) на delta юнитов.",
    input_schema: { type: "object", properties: { ids: ids("id объектов"), delta: vec3("сдвиг x,y,z") }, required: ["ids", "delta"] },
  },
  {
    name: "delete_objects",
    description: "Удаляет объекты по id.",
    input_schema: { type: "object", properties: { ids: ids("id объектов") }, required: ["ids"] },
  },
  {
    name: "select_objects",
    description: "Выделяет объекты в редакторе, чтобы пользователь видел, что изменилось. Камеру, панели и инструменты пользователя не трогает.",
    input_schema: { type: "object", properties: { ids: ids("id объектов") }, required: ["ids"] },
  },
  {
    name: "list_commands",
    description: "Команды палитры редактора (id и название), чтобы вызвать run_command. Можно отфильтровать по подстроке.",
    input_schema: { type: "object", properties: { filter: { type: "string" } } },
  },
  {
    name: "run_command",
    description: "Выполняет команду палитры по id (как пользователь из меню).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_files",
    description: "Файлы проекта карты (папка рядом с VMF: materials, sound, lua…). Lua карты лежит в lua/autorun/server и lua/autorun/client и попадает в игру аддоном при запуске.",
    input_schema: { type: "object", properties: { dir: { type: "string", description: "подпапка, по умолчанию корень" } } },
  },
  {
    name: "read_file",
    description: "Читает текстовый файл проекта по относительному пути.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "write_file",
    description: "Пишет текстовый файл проекта (Lua, VMT, txt) по относительному пути; пользователь подтверждает запись и видит диф.",
    input_schema: { type: "object", properties: { path: { type: "string" }, text: { type: "string" } }, required: ["path", "text"] },
  },
  {
    name: "save_map",
    description: "Сохраняет карту в её VMF.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "compile_map",
    description:
      "Сохраняет и собирает карту (vbsp, vvis, vrad по настройкам панели «Сборка»), ждёт конца и возвращает итог: успех, время, строки с ошибками и предупреждениями, утечку, хвост лога. Читай итог и чини ошибки сам.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "compile_log",
    description: "Лог последней сборки из панели «Сборка»: строки с ошибками и предупреждениями, число точек утечки, последние строки; строки с префиксом [game] - консоль запущенной игры.",
    input_schema: {
      type: "object",
      properties: { tail: { type: "integer", description: "сколько последних строк показать, по умолчанию 40" }, all: { type: "boolean", description: "весь лог, а не только ошибки" } },
    },
  },
  {
    name: "leak_info",
    description: "Если сборка нашла утечку (leak): точки линии утечки из pointfile, от энтити наружу; по ним видно, где дыра. Подсвечивает линию в видах.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "check_problems",
    description: "Проверка карты как в панели «Проблемы»: невыпуклые браши, пропавшие материалы и модели, неизвестные классы, пустые targetname у выходов. Возвращает нумерованный список с объектами.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "fix_problems",
    description: "Автоисправление находок check_problems по их номерам (или всех), как кнопка «Исправить».",
    input_schema: { type: "object", properties: { numbers: { type: "array", items: { type: "integer" }, description: "номера из check_problems; пусто - все" } } },
  },
  {
    name: "set_world_keys",
    description: "Ключи worldspawn: skyname (например sky_day01_01), detailmaterial, maxpropscreenwidth и т. п. null удаляет ключ.",
    input_schema: { type: "object", properties: { keyvalues: { type: "object", additionalProperties: { type: ["string", "null"] } } }, required: ["keyvalues"] },
  },
  {
    name: "pack_report",
    description: "Что из пользовательского контента (материалы, модели, звуки) карта требует и чего не хватает, как в «Сборка → упаковка».",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_game",
    description:
      "Запускает Garry's Mod на собранной карте (Lua проекта уезжает аддоном), ждёт связи с игрой до двух минут и возвращает: вышла ли игра на связь, какую карту грузит, ошибки консоли (в том числе Lua). clean: без аддонов Мастерской, чтобы в консоли был только шум карты.",
    input_schema: { type: "object", properties: { clean: { type: "boolean" } } },
  },
  {
    name: "game_status",
    description: "Состояние запущенной игры: работает ли, на связи ли мост, карта, позиция игрока, последние события моста, ошибки консоли.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "game_reload",
    description: "Перезагружает карту в запущенной игре (после пересборки BSP); для новых Lua-файлов нужен run_game заново.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "game_teleport",
    description: "Переносит игрока в запущенной игре в точку (noclip, скорость сброшена) и возвращает позу, которая установилась через несколько тиков.",
    input_schema: { type: "object", properties: { pos: vec3("x,y,z"), yaw: { type: "number" }, pitch: { type: "number" } }, required: ["pos"] },
  },
  {
    name: "game_kill",
    description: "Закрывает игру, которую запускал редактор.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "game_screenshot",
    description:
      "Снимок из запущенной игры (картинка) без HUD и оружия. Без pos - глазами игрока; с pos и ang - свободной камерой из любой точки, игрок не двигается. frames > 1 делает серию с интервалом (увидеть движение). Смотри на снимок и говори, что видишь: свет, текстуры, пропорции, ошибки.",
    input_schema: {
      type: "object",
      properties: {
        quality: { type: "integer", description: "JPEG 20…95, по умолчанию 75" },
        pos: vec3("позиция камеры x,y,z"),
        pitch: { type: "number" },
        yaw: { type: "number" },
        fov: { type: "number" },
        frames: { type: "integer", description: "кадров, до 4" },
        interval: { type: "number", description: "секунд между кадрами" },
        hud: { type: "boolean" },
      },
    },
  },
  {
    name: "game_lua",
    description:
      "Выполняет Lua в запущенной игре и возвращает результат (return …) или ошибку. realm server: ents.FindByName, состояние энтити, I/O, физика; client: render.GetLightColor, звук, LocalPlayer. Таблицы приходят JSON. Ничего не пишется на диск.",
    input_schema: { type: "object", properties: { code: { type: "string" }, realm: { type: "string", enum: ["server", "client"] } }, required: ["code"] },
  },
  {
    name: "game_console",
    description:
      "Консольная команда в игре (noclip, mat_fullbright 1, developer 1, r_drawviewmodel 0, ent_fire …) и строки, которые консоль вывела в следующие полторы секунды. Часть команд движок блокирует из Lua (buildcubemaps, map, exec).",
    input_schema: { type: "object", properties: { cmd: { type: "string" } }, required: ["cmd"] },
  },
  {
    name: "game_trace",
    description: "Луч в игре от from до to (util.TraceLine): во что упёрся, где, материал и энтити. Проверить проходимость, высоту потолка, дыры.",
    input_schema: { type: "object", properties: { from: vec3("начало"), to: vec3("конец") }, required: ["from", "to"] },
  },
  {
    name: "game_light_at",
    description: "Освещённость в точке по версии игры (render.GetLightColor): r, g, b 0…1 и оценка словами.",
    input_schema: { type: "object", properties: { pos: vec3("точка") }, required: ["pos"] },
  },
  {
    name: "game_console_log",
    description: "Консоль игры за запуск: строки без шума (шрифты, частицы), повторы схлопнуты с числом, первыми строки про карту, материалы, модели, звуки и Lua. filter - подстрока.",
    input_schema: { type: "object", properties: { filter: { type: "string" }, limit: { type: "integer" } } },
  },
  {
    name: "find_faces",
    description: "Грани с данным материалом (подстрока, без учёта регистра): браш, грань, нормаль, масштаб текстуры. Чтобы найти, где лежит пропавший материал.",
    input_schema: { type: "object", properties: { material: { type: "string" } }, required: ["material"] },
  },
  {
    name: "brush_info",
    description: "Браш целиком: границы и каждая грань с материалом, нормалью, масштабом и сдвигом текстуры.",
    input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "replace_material",
    description: "Заменяет материал на всей карте или в выделении (точное имя, или подстрока при substring).",
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" }, scope: { type: "string", enum: ["map", "selection"] }, substring: { type: "boolean" } },
      required: ["from", "to"],
    },
  },
  {
    name: "game_file_exists",
    description: "Есть ли файл в смонтированном контенте игры и проекта: путь как в VFS (materials/custom/wall.vmt, sound/ambient/x.wav, models/props_c17/oildrum001.mdl).",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "vtf_info",
    description: "Заголовок текстуры по имени (skybox/sky_day01_01up, dev/dev_measurewall01c) или материала: размер, мипы, кадры, формат, флаги, версия. Сверить скайбокс по шести граням.",
    input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "editor_camera",
    description: "Камера 3D-вида редактора: без аргументов возвращает позицию и углы; с pos/pitch/yaw ставит её (test_cycle и game_screenshot без pos снимают из неё).",
    input_schema: { type: "object", properties: { pos: vec3("позиция"), pitch: { type: "number" }, yaw: { type: "number" } } },
  },
  {
    name: "editor_screenshot",
    description: "Снимок вида редактора без сборки: 3d (камера) или top, front, side (2D с сеткой) - картинка, чтобы проверить геометрию.",
    input_schema: { type: "object", properties: { view: { type: "string", enum: ["3d", "top", "front", "side"] } } },
  },
  {
    name: "test_cycle",
    description:
      "Тест-цикл одной командой: сохранить, собрать, перезагрузить карту в игре (или запустить игру), поставить игрока туда, куда смотрит камера редактора, и сделать снимок. Возвращает итог сборки, ошибки консоли и снимок. Используй после правок, чтобы увидеть результат.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "undo_last",
    description: "Отменяет последние правки карты (свои ошибки), count шагов.",
    input_schema: { type: "object", properties: { count: { type: "integer" } } },
  },
  {
    name: "list_notes",
    description: "Заметки на карте - список дел пользователя с местом: id, открыта или сделана, текст, координаты.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_note",
    description: "Добавляет заметку с текстом в точке pos; без pos - у выделения или перед камерой. Для того, что надо доделать позже, или по просьбе «запомни место».",
    input_schema: { type: "object", properties: { text: { type: "string" }, pos: vec3("место x,y,z") }, required: ["text"] },
  },
  {
    name: "update_note",
    description: "Меняет заметку по id: новый текст, отметка «сделано» (done) или удаление (remove: true).",
    input_schema: { type: "object", properties: { id: { type: "integer" }, text: { type: "string" }, done: { type: "boolean" }, remove: { type: "boolean" } }, required: ["id"] },
  },
];

export const SYSTEM_PROMPT = `Ты помощник внутри Mallet - редактора карт Source для Garry's Mod. Пользователь пишет на своём языке, что сделать с картой или какой Lua нужен; ты делаешь это инструментами и коротко отчитываешься на языке интерфейса, который назван в конце.

Мир: юниты Hammer, ось Z вверх, 1 юнит ≈ 1,9 см. Игрок 72 юнита высотой и 32 шириной, дверной проём 56×112, потолок жилой комнаты 128–192, ступень до 18. Координаты кратны сетке (обычно 16 или 64). Браши - выпуклые блоки; комната - коробка, сделанная полой (hollow_brushes), или шесть стен. Карта должна быть замкнута, иначе leak. Материалы: dev/dev_measurewall01c (стены), dev/dev_measuregeneric01b (пол), tools/toolsnodraw (невидимые грани), tools/toolstrigger (триггеры). Свет: light с ключом _light "255 240 220 200". Старт игрока: info_player_start на 16 юнитов выше пола. Двери: func_door с ключами movedir "0 90 0" (угол сдвига), speed, lip; кнопка func_button с выходом OnPressed -> дверь Open. Пропы: prop_physics или prop_static с ключом model (models/props_c17/oildrum001.mdl и т. п.).

Lua: файлы проекта lua/autorun/server/*.lua (сервер: hook.Add, ents, timer) и lua/autorun/client/*.lua (клиент); при запуске игры из редактора они подкладываются аддоном. Пиши идиоматичный GLua с проверками на nil и комментариями на языке пользователя. Для связи карты и Lua используй targetname и ents.FindByName.

Порядок: если нужны id, размеры или существующие энтити - сначала map_summary или list_entities. Делай все правки одного запроса подряд, затем select_objects на созданном, затем краткий отчёт: что и где создано, какие id. Не спрашивай подтверждения на правки карты (их можно отменить), но не собирай и не запускай игру без просьбы. Панели, камеру и инструменты пользователя не переключай и ничего за него не нажимай: каждая правка видна в видах сразу, а ход работы - карточками в панели ассистента.

Ты работаешь внутри редактора и видишь его панели инструментами: compile_log и compile_map - панель «Сборка», check_problems - «Проблемы», game_status и run_game - консоль и мост игры, pack_report - упаковка, leak_info - утечка. Рассказывай пользователю по ходу, что ты видишь и делаешь: перед вызовом - зачем он, после - что в нём нашёл («в логе сборки vbsp пишет: …», «проблема в том, что …», «исправляю: …», «пробую снова»). Когда пользователь просит собрать или запустить: сначала check_problems и исправь находки, потом compile_map, прочитай его итог; если есть ошибки или утечка - объясни причину, исправь сам (set_world_keys для skyname, fix_problems, правки брашей, leak_info для дыры) и собери снова, до трёх попыток; затем run_game и прочитай ошибки консоли и Lua, почини файл и запусти заново. Если после трёх попыток не вышло - честно опиши, что осталось, и что сделать руками. Типовые ошибки: «leaked» - дыра в мировых брашах или энтити снаружи; «Skybox vtf files … missing» - skyname указывает на отсутствующий скайбокс, поставь существующий (sky_day01_01); «material … not found» - нет материала, замени на dev/…; «brush … non-convex» - fix_problems; Lua «attempt to index a nil value» - проверь ents.FindByName и порядок загрузки. После правок геометрии или света полезно увидеть результат: test_cycle пересобирает и показывает снимок из игры, game_screenshot делает снимок прямо сейчас; опиши пользователю, что видно на снимке, и что стоит поправить. Если снимок пришёл файлом (через Claude Code), прочитай его инструментом Read. game_lua и game_console дают прямой доступ к игре: проверяй энтити, звук, свет, дыры лучом game_trace; после выхода игры game_status скажет причину (дамп, штатное закрытие). Отвечай кратко, без воды, но не пропускай найденные ошибки. Заметки (list_notes, add_note, update_note) - список дел пользователя с местом на карте, виден в панели «Заметки» и в видах; найденное, что нельзя починить сразу, записывай заметкой у места, а сделанное отмечай done.`;

const MAX_STEPS = 40;

/** The system prompt's fixed part: the rules and the interface language. */
export function systemStatic(): string {
  return `${SYSTEM_PROMPT}\n\nЯзык интерфейса пользователя: ${languageOf(currentLocale()).english}. Отвечай на нём.`;
}

/** The system prompt for one API request: the fixed part and the map as it stands. */
export function systemFor(ctx: AssistantContext): string {
  return `${systemStatic()}\n\nСостояние карты в начале запроса:\n${ctx.summary()}`;
}

/** What a Claude Code run reports while it goes (the shell translates its stream). */
export type CliEvent =
  | { kind: "session"; id: string }
  | { kind: "block_start"; type: string; name?: string | null }
  | { kind: "text"; text: string }
  | { kind: "json"; text: string }
  | { kind: "block_stop" }
  | { kind: "tool_call"; callId: string; name: string; input: Record<string, unknown> }
  | { kind: "done"; isError: boolean; subtype: string; result: string; sessionId?: string | null; inputTokens: number; outputTokens: number; numTurns: number; costUsd?: number | null };

export interface CliRequest {
  prompt: string;
  system: string;
  model: string;
  tools: ToolDef[];
  resume: string | null;
}

/** Claude Code's conversation as the webview tracks it: the CLI session, how many requests went, the undo depth after the last one. */
export interface CliSession {
  id: string | null;
  turns?: number;
  depth?: number;
}

/** The shell's side of a Claude Code run: start it, answer its tool calls, stop it. */
export interface CliRunner {
  run(req: CliRequest, onEvent: (e: CliEvent) => void): Promise<void>;
  reply(callId: string, out: ToolOutcome): Promise<void>;
  stop(): Promise<void>;
  /** A new conversation: the process and its session go. */
  reset(): Promise<void>;
}

/**
 * One request through Claude Code: the CLI drives the conversation and calls
 * the editor's tools over MCP; each call is run here as it arrives and
 * answered, while the reply keeps streaming. Reports the same events as
 * `assistantTurn`. The session id is kept so the next request continues the talk.
 */
export async function cliTurn(
  text: string,
  model: string,
  runner: CliRunner,
  ctx: AssistantContext,
  onEvent: (e: AssistantEvent) => void,
  stop: { current: boolean } | undefined,
  session: CliSession,
): Promise<{ edits: number; steps: number; text: string; cost: number }> {
  let edits = 0;
  let steps = 0;
  let cost = 0;
  let live = false;
  let streamedText = "";
  let finalText = "";
  let queue: Promise<void> = Promise.resolve();
  const closeText = () => {
    if (live) onEvent({ kind: "text_end" });
    live = false;
  };
  // The process lives across requests with one system prompt, so the map's state travels with each
  // request: the whole summary the first time, afterwards only what changed since the last one.
  const followUp = !!session.id && (session.turns ?? 0) > 0 && !!ctx.brief;
  const state = followUp ? ctx.brief!(session.depth ?? 0) : ctx.summary();
  const prompt = `${followUp ? "Карта с прошлого запроса (полная сводка уже была; здесь счётчики, выделение и правки с тех пор)" : "Состояние карты сейчас"}:\n${state}\n\nЗапрос пользователя:\n${text}`;
  await runner.run({ prompt, system: systemStatic(), model, tools: TOOLS, resume: session.id }, (e) => {
    if (e.kind === "session") session.id = e.id;
    else if (e.kind === "block_start") {
      closeText();
      if (e.type === "tool_use" && e.name) onEvent({ kind: "tool_pending", name: e.name });
    } else if (e.kind === "text") {
      live = true;
      streamedText += e.text;
      onEvent({ kind: "text_delta", text: e.text });
    } else if (e.kind === "block_stop") closeText();
    else if (e.kind === "tool_call") {
      // One at a time, in order; the CLI waits for each answer.
      queue = queue.then(async () => {
        steps++;
        onEvent({ kind: "tool_start", name: e.name, input: e.input });
        let out: ToolOutcome;
        if (stop?.current) out = { result: "Пользователь остановил помощника", error: true };
        else {
          try {
            out = await ctx.runTool(e.name, e.input);
          } catch (err) {
            out = { result: String(err), error: true };
          }
        }
        if (out.edited) edits++;
        onEvent({ kind: "tool", name: e.name, input: e.input, result: out.result, error: !!out.error, edited: !!out.edited, ids: out.ids });
        await runner.reply(e.callId, { ...out, result: out.result.slice(0, 20000) });
      });
    } else if (e.kind === "done") {
      closeText();
      if (e.sessionId) session.id = e.sessionId;
      onEvent({ kind: "usage", inputTokens: e.inputTokens, outputTokens: e.outputTokens });
      finalText = e.result;
      cost = e.costUsd ?? 0;
      if (e.isError) onEvent({ kind: "error", text: e.result || e.subtype });
      // A result without a streamed reply (nothing came in pieces): show it whole.
      else if (!streamedText.trim() && e.result.trim()) onEvent({ kind: "text", text: e.result });
    }
  });
  await queue;
  closeText();
  session.turns = (session.turns ?? 0) + 1;
  session.depth = ctx.undoDepth?.() ?? 0;
  return { edits, steps, text: finalText || streamedText, cost };
}

/**
 * One request: sends the messages, runs every tool the model asks for,
 * feeds the results back, until the model stops. Returns how many map
 * edits happened (undo steps) and the messages as they now stand.
 */
export async function assistantTurn(
  messages: Message[],
  model: string,
  backend: Backend,
  ctx: AssistantContext,
  onEvent: (e: AssistantEvent) => void,
  stop?: { current: boolean },
  backendKind: BackendKind = "auto",
): Promise<{ edits: number; steps: number }> {
  let edits = 0;
  let steps = 0;
  const system = systemFor(ctx);
  for (let i = 0; i < MAX_STEPS; i++) {
    if (stop?.current) break;
    // Each tool call runs as soon as the model has finished writing it, one
    // after another, while the rest of the reply is still arriving. A backend
    // without streaming reports nothing until the end; the calls then run here.
    const results = new Map<string, Block>();
    let queue: Promise<void> = Promise.resolve();
    const runUse = (u: Extract<Block, { type: "tool_use" }>) => {
      queue = queue.then(async () => {
        if (results.has(u.id)) return;
        onEvent({ kind: "tool_start", name: u.name, input: u.input ?? {} });
        let out: ToolOutcome;
        if (stop?.current) out = { result: "Пользователь остановил помощника", error: true };
        else {
          try {
            out = await ctx.runTool(u.name, u.input ?? {});
          } catch (err) {
            out = { result: String(err), error: true };
          }
        }
        if (out.edited) edits++;
        onEvent({ kind: "tool", name: u.name, input: u.input ?? {}, result: out.result, error: !!out.error, edited: !!out.edited, ids: out.ids });
        const text = out.result.slice(0, 20000);
        results.set(u.id, {
          type: "tool_result",
          tool_use_id: u.id,
          content: out.image
            ? [
                { type: "text", text },
                { type: "image", source: { type: "base64", media_type: out.image.mediaType, data: out.image.data } },
              ]
            : text,
          is_error: out.error || undefined,
        });
      });
    };
    let live = false;
    let streamed = false;
    const r = await backend({ model, system, messages, tools: TOOLS, maxTokens: 4096, backend: backendKind }, (d) => {
      if (d.kind === "text") {
        live = true;
        streamed = true;
        onEvent({ kind: "text_delta", text: d.text });
      } else if (d.kind === "block_start") {
        if (live) onEvent({ kind: "text_end" });
        live = false;
        if (d.type === "tool_use" && d.name) onEvent({ kind: "tool_pending", name: d.name });
      } else runUse({ type: "tool_use", id: d.id, name: d.name, input: d.input });
    });
    if (live) onEvent({ kind: "text_end" });
    steps++;
    messages.push({ role: "assistant", content: r.content });
    onEvent({ kind: "usage", inputTokens: r.inputTokens, outputTokens: r.outputTokens });
    if (!streamed) for (const b of r.content) if (b.type === "text" && b.text.trim()) onEvent({ kind: "text", text: b.text });
    const uses = r.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (r.stopReason !== "tool_use" || !uses.length) {
      await queue;
      break;
    }
    for (const u of uses) runUse(u);
    await queue;
    messages.push({ role: "user", content: uses.map((u) => results.get(u.id)!).filter(Boolean) });
  }
  return { edits, steps };
}

/**
 * A backend that needs no key: builds a small room with a light and a
 * player start in front of whatever the map has, then reports. Used by
 * the browser build and the autotest.
 */
export const mockBackend: Backend = async (req) => {
  const assistantTurns = req.messages.filter((m) => m.role === "assistant").length;
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const asked = typeof lastUser?.content === "string" ? lastUser.content : "";
  if (assistantTurns % 3 === 0) {
    return {
      content: [
        { type: "text", text: `Демо-режим (без ключа API): создаётся комната 512×512×192 с источником света и точкой появления игрока по запросу «${asked.slice(0, 60)}».` },
        { type: "tool_use", id: "mock_1", name: "create_brush", input: { min: [-256, -256, 0], max: [256, 256, 192], material: "dev/dev_measurewall01c" } },
      ],
      stopReason: "tool_use",
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  if (assistantTurns % 3 === 1) {
    const prev = [...req.messages].reverse().find((m) => m.role === "user" && typeof m.content !== "string");
    const idText = prev && typeof prev.content !== "string" ? ((prev.content[0] as { content?: string }).content ?? "") : "";
    const id = Number(/id (\d+)/.exec(idText)?.[1] ?? 0);
    return {
      content: [
        { type: "tool_use", id: "mock_2", name: "hollow_brushes", input: { ids: [id], thickness: 16 } },
        { type: "tool_use", id: "mock_3", name: "create_entity", input: { classname: "light", origin: [0, 0, 160], keyvalues: { _light: "255 240 220 200", targetname: "demo_light" } } },
        { type: "tool_use", id: "mock_4", name: "create_entity", input: { classname: "info_player_start", origin: [0, 0, 32] } },
      ],
      stopReason: "tool_use",
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  return {
    content: [
      {
        type: "text",
        text: "Готово: комната 512×512×192 со стенами толщиной 16, источник света demo_light под потолком и info_player_start на полу. Все правки отменяются кнопкой отмены в заголовке панели.",
      },
    ],
    stopReason: "end_turn",
    inputTokens: 0,
    outputTokens: 0,
  };
};

/** The text of a message for the chat log. */
export function messageText(m: Message): string {
  if (typeof m.content === "string") return m.content;
  return m.content
    .map((b) => (b.type === "text" ? b.text : b.type === "tool_use" ? `[${b.name}]` : ""))
    .filter(Boolean)
    .join("\n");
}
