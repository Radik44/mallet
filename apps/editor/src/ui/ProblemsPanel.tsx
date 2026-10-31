// Check for Problems: findings from the document (invalid brushes, bad
// targets, duplicate ids…) plus FGD and content checks done by the editor.
// A row selects the object and opens a plain-language hint; kinds with an
// automatic fix get a button, and "Исправить всё" runs every fix at once.

import { Icon } from "./Icon";
import { useState } from "react";
import { Empty, PanelFrame, Row } from "./kit";
import { t, lazy, tb } from "../i18n";

export interface Problem {
  kind: string;
  object: number;
  message: string;
  /** Extra data for a fix (the material name of `missing_material`). */
  detail?: string;
}

interface Props {
  problems: Problem[] | null;
  onRefresh(): void;
  onSelect(p: Problem): void;
  /** Applies the automatic fix for one finding. */
  onFix(p: Problem): void;
  /** Applies every available fix. */
  onFixAll(): void;
  /** Hands the findings to the assistant. */
  onAsk?(): void;
  /** Selects the objects of several findings at once. */
  onSelectAll?(objects: number[]): void;
  /** Keeps a finding as a note at its place, to come back to later. */
  onNote?(p: Problem, text: string): void;
  /** Hidden objects: the placement checks look at what is shown, yet hidden ones still go into the compile. */
  hiddenCount?: number;
  /** Shows everything hidden. */
  onShowHidden?(): void;
}

const KIND_TITLES: Record<string, string> = lazy(() => ({
  invalid_solid: t("Некорректный браш"),
  outside_world: t("Вне границ мира"),
  too_many_sides: t("Слишком много граней"),
  empty_material: t("Не задан материал"),
  zero_texture_scale: t("Нулевой масштаб текстуры"),
  empty_class: t("Не задан класс"),
  no_origin: t("Не задан origin"),
  bad_target: t("Цель не найдена"),
  duplicate_id: t("Повторяющийся id"),
  unknown_class: t("Неизвестный класс"),
  point_class_with_brushes: t("Точечный класс с брашами"),
  solid_class_without_brushes: t("Брашевый класс без брашей"),
  missing_material: t("Материал не найден"),
  missing_model: t("Модель не найдена"),
  missing_sky: t("Скайбокс не найден"),
  stuck_spawn: t("Точка появления в браше"),
  light_in_solid: t("Источник света в браше"),
  no_outputs: t("Нет выходов"),
  no_sun: t("Нет light_environment"),
  entity_outside: t("Энтити вне карты"),
  world_detail: t("Мелкие браши в мире"),
  off_grid: t("Браши не на сетке"),
  stacked_brushes: t("Дублирующиеся браши"),
  stacked_twins: t("Дублирующиеся энтити"),
  bad_output: t("Неизвестный выход"),
  bad_input: t("Неизвестный вход"),
  bad_name: t("Недопустимые символы в имени"),
  overlay_sides: t("Неактуальные грани оверлея"),
  pivot_outside: t("Ось вращения вне брашей"),
  static_not_static: t("Модель не подходит для prop_static"),
  no_cubemap: t("Нет кубмапа"),
  parent_loop: t("Циклическая привязка"),
  prop_in_solid: t("Физический проп в браше"),
  disp_in_entity: t("Дисплейсмент в энтити"),
  mergeable: t("Браши можно объединить"),
  near_limit: t("Приближение к лимиту Source"),
  no_physics: t("Проп без физики"),
  door_no_hinge: t("Дверь без оси вращения"),
  extra_sun: t("Лишний light_environment"),
}));

/** What the finding means and what to do about it, for someone new to Hammer. */
const HINTS: Record<string, string> = lazy(() => ({
  invalid_solid: t(
    "Грани браша не образуют замкнутый выпуклый объём: VBSP пропустит браш или завершится с ошибкой. Обычно это следствие работы инструментов «Вершины» или «Разрез». Рекомендуется удалить браш и построить его заново.",
  ),
  outside_world: t("Браш выходит за пределы ±16384 юнитов, и VBSP остановится с ошибкой. Переместите браш ближе к центру карты или удалите его."),
  too_many_sides: t("У браша больше 128 граней, VBSP не примет его. Разрежьте браш на несколько частей («Разрез») или замените моделью."),
  empty_material: t("У грани не задан материал, в игре она будет чёрной или невидимой. Исправление назначает текущий материал."),
  zero_texture_scale: t("При масштабе 0 текстура растягивается бесконечно, VBSP выдаст ошибку. Исправление задаёт стандартный масштаб 0.25."),
  empty_class: t("У энтити не задан classname, и игра не сможет её создать. Удалите энтити или задайте класс в свойствах."),
  no_origin: t("У точечной энтити не задан origin, игра поместит её в 0 0 0. Исправление записывает origin явно; затем переместите энтити в нужное место."),
  bad_target: t("Выход ссылается на имя, которого нет на карте, и не будет иметь эффекта. Проверьте targetname цели или удалите связь (исправление удаляет связи с несуществующими целями)."),
  duplicate_id: t("Объекты с одинаковым id приводят к ошибкам в Hammer и редакторе. Исправление назначает повторяющимся объектам новые id."),
  unknown_class: t("Класса нет в FGD выбранной игры: энтити не появится в игре или будет работать неправильно. Проверьте написание класса или выберите другую игру в настройках."),
  point_class_with_brushes: t("Класс точечный (с origin), но у энтити есть браши. Выделите браши и выполните «Снять энтити» (Ctrl+Shift+W) или смените класс на брашевый (func_*)."),
  solid_class_without_brushes: t("Класс брашевый, но у энтити нет брашей: VBSP пропустит её. Привяжите браши (Ctrl+T) или смените класс на точечный."),
  missing_material: t("Файл VMT не найден в контенте игры, в игре грань будет розово-чёрной. Исправление заменяет материал на текущий по всей карте."),
  missing_model: t("Файл MDL не найден в контенте игры, вместо модели появится красная надпись ERROR. Выберите другую модель в свойствах энтити."),
  stuck_spawn: t(
    "Габариты игрока (32 × 32 × 72 от уровня ног) в этой точке появления пересекают стену или пол: игрок застрянет или провалится. «Поднять» ставит точку на пол (End опускает выделение на поверхность); от стены точку нужно отодвинуть вручную. Наклонные браши проверяются по габаритам, поэтому возможны ложные срабатывания.",
  ),
  light_in_solid: t(
    "Источник света находится внутри стены, пола или потолка: VRAD рассчитывает свет изнутри браша, и помещение останется тёмным. «Выдвинуть» выносит источник из браша через ближайшую грань. Наклонные браши проверяются по габаритам, поэтому возможны ложные срабатывания.",
  ),
  no_outputs: t(
    "Триггеры, кнопки и логические энтити действуют только через выходы (Outputs), а у этой энтити их нет: в игре её срабатывание ни на что не повлияет. Добавьте связь на вкладке «Выходы» в свойствах, например OnTrigger → door_1 → Open.",
  ),
  no_sun: t(
    "На карте есть небо (tools/toolsskybox), но нет light_environment: VRAD не рассчитает ни солнечный, ни рассеянный свет неба, и открытые участки останутся тёмными. «Добавить солнце» ставит light_environment над точкой появления игрока (наклон −60°).",
  ),
  extra_sun: t("VRAD учитывает только первый light_environment, остальные не влияют на освещение. Удалите лишние или перенесите их настройки в первый."),
  entity_outside: t(
    "Энтити находится вне всех брашей мира, в пустоте. VBSP обнаружит через неё утечку: карта не будет замкнута, VVIS не запустится, освещение будет плоским. Переместите энтити внутрь карты или удалите её (Ctrl+Alt+F переносит выделение к камере).",
  ),
  mergeable: t(
    "Прямоугольные браши мира с одинаковой текстурой примыкают друг к другу целой гранью: стена из нескольких блоков, пол из полос. Каждый лишний браш добавляет грани и разрезы BSP. «Объединить» превращает каждую такую группу в один браш за один шаг (Ctrl+Z отменяет); текстура выравнивается по миру, масштаб сохраняется.",
  ),
  disp_in_entity: t(
    "В Source дисплейсменты допустимы только в мире: на func_detail, двери или триггере VBSP останавливается с ошибкой «displacement found on a brush entity». Для func_detail «Вернуть в мир» переносит её браши в мир без смещения (Ctrl+Z отменяет). Дисплейсмент другой энтити перенесите в мир вручную или замените моделью.",
  ),
  prop_in_solid: t(
    "Центр физического пропа (prop_physics, prop_ragdoll) находится внутри браша: при старте карты физика выталкивает его, и проп подпрыгивает, отлетает или застревает с дрожанием. «Вынести из браша» ставит проп на поверхность, в которую он погружён, или выносит через ближайшую грань (Ctrl+Z отменяет).",
  ),
  parent_loop: t(
    "Энтити привязаны друг к другу по кругу через parentname (A к B, B к A или энтити сама к себе). Движок не может определить порядок перемещения: при загрузке выводится предупреждение, энтити оказываются в начале координат или игра аварийно завершается. «Разорвать цикл» очищает parentname у первой энтити цикла (Ctrl+Z отменяет).",
  ),
  no_cubemap: t(
    "Отражающие материалы (вода, стекло, металл, мокрый пол) берут отражения из ближайшего env_cubemap. Без него они отражают чёрный цвет или чужое небо - частая причина «странной воды». «Добавить env_cubemap» ставит один кубмап над точкой появления игрока; в каждом помещении с такими материалами рекомендуется отдельный. После сборки соберите кубмапы в панели «Сборка» (buildcubemaps).",
  ),
  static_not_static: t(
    "prop_static принимает только модели, собранные с $staticprop. С другой моделью VBSP выводит «must be used on a dynamic entity» и удаляет проп, и в игре его не будет. «Сделать prop_dynamic» меняет класс на prop_dynamic с той же моделью, положением и ключами (Ctrl+Z отменяет).",
  ),
  pivot_outside: t(
    "func_rotating и вращающиеся кнопки вращаются вокруг своего origin. Если origin не задан (тогда это 0 0 0) или находится далеко от брашей, вентилятор или колесо в игре будет двигаться по большой окружности. «Центрировать origin» ставит ось в центр брашей (Ctrl+Z отменяет).",
  ),
  overlay_sides: t(
    "info_overlay проецируется только на грани из ключа sides. Если оверлей переместили или стену под ним перестроили, в sides остаются старые номера граней, и после сборки оверлей пропадает. «Обновить грани» записывает в sides грани, которые сейчас находятся под оверлеем (Ctrl+Z отменяет).",
  ),
  bad_name: t(
    "Имя энтити (targetname) содержит пробел, запятую или кавычку. Source разделяет строку выхода по этим символам, поэтому выходы, направленные на это имя, не срабатывают, а Hammer об этом не предупреждает. «Исправить имя» заменяет такие символы подчёркиванием у всех энтити с этим именем и обновляет все выходы и ключи-ссылки за один шаг (Ctrl+Z отменяет).",
  ),
  bad_input: t(
    "Выход вызывает вход, которого у цели нет: опечатка (Toogle) или вход другого класса (TurnOn у двери). Игра молча отбрасывает такое событие, а Hammer выделяет строку только на вкладке выходов этой энтити. Если в FGD цели есть похожее имя, «Исправить вход» подставит его в эту связь (Ctrl+Z отменяет).",
  ),
  bad_output: t(
    "Связь назначена на выход, который этот класс не вызывает: OnTrigger у кнопки (у неё OnPressed) или опечатка. Такая связь никогда не сработает. Если в FGD есть похожее имя, «Исправить выход» подставит его (Ctrl+Z отменяет).",
  ),
  stacked_twins: t(
    "Несколько одинаковых энтити (тот же класс, модель, положение, углы и имя) находятся в одной точке - обычно после Ctrl+D или вставки без смещения. В Hammer дубликаты не видны, а в игре грани мерцают, физические пропы разлетаются при старте, лишние энтити расходуют лимит. «Удалить дубликаты» оставляет одну энтити (Ctrl+Z отменяет).",
  ),
  stacked_brushes: t(
    "Один и тот же браш (те же габариты и текстуры) повторяется в одном месте несколько раз - обычно после Ctrl+D или вставки без смещения. В Hammer это не видно, а в игре грани мерцают, и VBSP создаёт лишние разрезы. «Удалить дубликаты» оставляет по одному брашу в каждом месте за один шаг (Ctrl+Z отменяет).",
  ),
  off_grid: t(
    "Прямоугольный браш смещён на долю юнита (дробная сетка, масштабирование, вставленный префаб): его грани не совпадают с соседними, в игре видны щели, а VBSP может обнаружить утечку. Размер браша целый, поэтому «Выровнять по сетке» сдвигает его к ближайшим целым координатам - все найденные браши за один шаг (Ctrl+Z отменяет).",
  ),
  world_detail: t(
    "Ступени, бордюры, колонны и мебель из брашей мира дробят карту на множество областей видимости: VVIS работает дольше, а отсечение в игре - хуже. Браши размером до 128 юнитов рекомендуется сделать func_detail: они остаются твёрдыми и видимыми, но не участвуют в расчёте видимости. «Сделать func_detail» применяет это ко всем найденным брашам за один шаг (Ctrl+Z отменяет).",
  ),
  near_limit: t(
    "Карта использует более 80 % одного из лимитов движка Source. При превышении VBSP остановится в конце сборки с ошибкой MAX_MAP_…. Чтобы сохранить запас, объедините мелкие браши, удалите невидимые, замените повторяющиеся элементы пропами или разделите карту.",
  ),
  no_physics: t(
    "У модели нет физической оболочки (файла .phy), а prop_physics без неё удаляется при появлении, и на карте его не будет. Выберите модель с физикой или нажмите «Сделать prop_dynamic»: такой проп неподвижен, управляется входами и не требует физики.",
  ),
  door_no_hinge: t(
    "У func_door_rotating не задана ось вращения (origin-браш с текстурой tools/toolsorigin или ключ origin), и дверь вращается вокруг своего центра, как турникет. «Ось у края» ставит origin у торца длинной стороны двери; если ось должна быть с другой стороны, измените ключ origin.",
  ),
  missing_sky: t("Файлы скайбокса, указанного в skyname, не найдены в контенте: небо будет чёрным. Измените skyname в свойствах карты (Map Properties)."),
}));

/** Button text for kinds that can be fixed automatically. */
const FIX_LABELS: Record<string, string> = lazy(() => ({
  invalid_solid: t("Удалить"),
  outside_world: t("Удалить"),
  empty_material: t("Задать материал"),
  zero_texture_scale: t("Задать масштаб"),
  empty_class: t("Удалить"),
  no_origin: t("Задать origin"),
  bad_target: t("Удалить связь"),
  duplicate_id: t("Назначить id"),
  missing_material: t("Заменить"),
  stuck_spawn: t("Поднять"),
  light_in_solid: t("Выдвинуть"),
  no_sun: t("Добавить солнце"),
  world_detail: t("Сделать func_detail"),
  off_grid: t("Выровнять по сетке"),
  stacked_brushes: t("Удалить дубликаты"),
  stacked_twins: t("Удалить дубликаты"),
  bad_output: t("Исправить выход"),
  bad_input: t("Исправить вход"),
  bad_name: t("Исправить имя"),
  overlay_sides: t("Обновить грани"),
  pivot_outside: t("Центрировать origin"),
  static_not_static: t("Сделать prop_dynamic"),
  no_cubemap: t("Добавить env_cubemap"),
  parent_loop: t("Разорвать цикл"),
  prop_in_solid: t("Вынести из браша"),
  disp_in_entity: t("Вернуть в мир"),
  mergeable: t("Объединить"),
  no_physics: t("Сделать prop_dynamic"),
  door_no_hinge: t("Ось у края"),
}));

export function canFix(p: Problem): boolean {
  // A start stuck in a wall has no lift to apply: it is moved by hand.
  if (
    p.kind === "stuck_spawn" ||
    p.kind === "light_in_solid" ||
    p.kind === "no_sun" ||
    p.kind === "world_detail" ||
    p.kind === "off_grid" ||
    p.kind === "stacked_brushes" ||
    p.kind === "stacked_twins" ||
    p.kind === "bad_output" ||
    p.kind === "bad_input" ||
    p.kind === "bad_name" ||
    p.kind === "overlay_sides" ||
    p.kind === "pivot_outside" ||
    p.kind === "no_cubemap" ||
    p.kind === "parent_loop" ||
    p.kind === "prop_in_solid" ||
    p.kind === "mergeable" ||
    p.kind === "disp_in_entity" ||
    p.kind === "door_no_hinge"
  )
    return !!p.detail;
  return p.kind in FIX_LABELS;
}

export function ProblemsPanel({ problems, onRefresh, onSelect, onFix, onFixAll, onAsk, onSelectAll, onNote, hiddenCount, onShowHidden }: Props) {
  const [open, setOpen] = useState<number>(-1);
  const fixable = problems?.filter(canFix).length ?? 0;
  return (
    <PanelFrame
      title={t("Проблемы")}
      subtitle={
        problems
          ? problems.length
            ? t("найдено: {0}, с автоисправлением: {1}", [problems.length, fixable])
            : hiddenCount
              ? t("в видимой части ошибок нет")
              : t("ошибок нет")
          : t("проверка не выполнялась")
      }
      className="browser"
      actions={
        <>
          {fixable > 0 && (
            <button className="primary" onClick={onFixAll} title={t("Применить все автоматические исправления")}>
              <Icon name="check" /> {t("Исправить всё")}
            </button>
          )}
          <button className="icon-btn" onClick={onRefresh} title={t("Проверить снова (Alt+P)")}>
            <Icon name="refresh" />
          </button>
        </>
      }
      footer={
        onAsk && problems && problems.length > 0 ? (
          <Row>
            <span className="muted list-text">{t("Нужны пояснения или ручное исправление?")}</span>
            <span className="grow" />
            <button onClick={onAsk} title={t("Ассистент объяснит каждую находку и исправит те, для которых нет автоматического исправления")}>
              <Icon name="brush" /> {t("Спросить ассистента")}
            </button>
          </Row>
        ) : undefined
      }
    >
      {problems && !!hiddenCount && (
        <Row className="problems-hidden" title={t("Скрытые объекты попадут в сборку, но проверки расположения учитывают только видимые")}>
          <span className="muted grow problems-hidden-text">
            {t("Скрыто")} {hiddenCount}
            {t(": часть проверок их не учитывает, но в сборку они попадут")}
          </span>
          {onShowHidden && <button onClick={onShowHidden}>{t("Показать всё")}</button>}
        </Row>
      )}
      {!problems ? (
        <Empty
          icon="check"
          title={t("Карта не проверена")}
          text={t("Проверка находит некорректные браши, отсутствующие материалы и модели, неверные связи и повторяющиеся id.")}
          action={
            <button className="primary" onClick={onRefresh}>
              {t("Проверить")}
            </button>
          }
        />
      ) : !problems.length ? (
        <Empty
          icon="check"
          title={hiddenCount ? t("В видимой части ошибок нет") : t("Ошибок не найдено")}
          text={hiddenCount ? t("В видимой части не найдено ничего, что помешало бы сборке. Покажите скрытые объекты, чтобы проверить и их.") : t("Не найдено ничего, что помешало бы сборке.")}
        />
      ) : (
        <div className="list">
          {problems.map((p, i) => (
            <div key={i}>
              <div
                className={`list-row problem-row${open === i ? " active" : ""}`}
                onClick={() => {
                  setOpen(open === i ? -1 : i);
                  onSelect(p);
                }}
                title={tb(p.message)}
              >
                <span className="list-kind">{KIND_TITLES[p.kind] ?? p.kind}</span>
                <span className="list-text">{tb(p.message)}</span>
                {canFix(p) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFix(p);
                    }}
                    title={HINTS[p.kind]}
                  >
                    {FIX_LABELS[p.kind]}
                  </button>
                )}
                {onNote && (
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNote(p, tb(p.message));
                    }}
                    title={t("В заметки: запомнить находку с местом на карте")}
                  >
                    <Icon name="text" size={13} />
                  </button>
                )}
              </div>
              {open === i && HINTS[p.kind] && <div className="muted problem-hint">{HINTS[p.kind]}</div>}
              {open === i &&
                onSelectAll &&
                (() => {
                  // Many of one kind (twenty props without physics): select them all in one go.
                  const same = problems.filter((q) => q.kind === p.kind && q.object > 0).map((q) => q.object);
                  return same.length > 1 ? (
                    <Row>
                      <button onClick={() => onSelectAll(same)} title={t("Выделить объекты всех находок этого вида")}>
                        {t("Выбрать все такие (")}
                        {same.length})
                      </button>
                    </Row>
                  ) : null;
                })()}
            </div>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
