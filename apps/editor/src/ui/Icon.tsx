// Small line icons for buttons, so common actions read at a glance instead
// of as words. All drawn on a 24-unit grid with the current text colour.

const PATHS: Record<string, string> = {
  play: "M7 4 L19 12 L7 20 Z",
  build: "M4 20 L10 14 M14 10 L20 4 M13 4 L20 11 M9 15 L4 20 M6 9 L15 18",
  bug: "M9 9 A3 3 0 0 1 15 9 V16 A3 3 0 0 1 9 16 Z M12 16 V20 M5 12 H9 M15 12 H19 M6 7 L9 9 M18 7 L15 9 M6 18 L9 16 M18 18 L15 16",
  import: "M12 3 V15 M7 10 L12 15 L17 10 M4 19 H20",
  refresh: "M20 12 A8 8 0 1 1 17.5 6 M20 3 V8 H15",
  trash: "M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 20 H16 L17 7 M10 11 V17 M14 11 V17",
  plus: "M12 5 V19 M5 12 H19",
  minus: "M5 12 H19",
  check: "M4 12 L9 17 L20 6",
  lock: "M6 11 H18 V21 H6 Z M9 11 V7 A3 3 0 0 1 15 7 V11",
  unlock: "M6 11 H18 V21 H6 Z M9 11 V7 A3 3 0 0 1 15 7",
  external: "M14 4 H20 V10 M20 4 L11 13 M18 14 V20 H4 V6 H10",
  settings: "M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M5 5 L7 7 M17 17 L19 19 M5 19 L7 17 M17 7 L19 5",
  search: "M10 4 A6 6 0 1 0 10 16 A6 6 0 1 0 10 4 M14.5 14.5 L20 20",
  focus: "M12 4 V8 M12 16 V20 M4 12 H8 M16 12 H20 M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9",
  eye: "M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9",
  eyeOff: "M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z M4 4 L20 20",
  save: "M4 4 H17 L20 7 V20 H4 Z M8 4 V10 H15 V4 M7 20 V14 H17 V20",
  replace: "M4 8 H17 M14 5 L17 8 L14 11 M20 16 H7 M10 13 L7 16 L10 19",
  undo: "M9 7 L4 12 L9 17 M4 12 H15 A5 5 0 0 1 15 22",
  redo: "M15 7 L20 12 L15 17 M20 12 H9 A5 5 0 0 0 9 22",
  up: "M12 19 V5 M6 11 L12 5 L18 11",
  down: "M12 5 V19 M6 13 L12 19 L18 13",
  edit: "M4 20 L8 19 L19 8 L16 5 L5 16 Z M14 7 L17 10",
  link: "M10 14 L14 10 M8 16 A3 3 0 0 1 8 11.5 L10 9.5 M16 8 A3 3 0 0 1 16 12.5 L14 14.5",
  heart: "M12 20.5 C7 16.5 3.5 13.4 3.5 9.3 A4.3 4.3 0 0 1 12 7.2 A4.3 4.3 0 0 1 20.5 9.3 C20.5 13.4 17 16.5 12 20.5 Z",
  world: "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M3 12 H21 M12 3 C8 8 8 16 12 21 C16 16 16 8 12 3",
  collapse: "M4 14 H10 V20 M10 14 L4 20 M20 10 H14 V4 M14 10 L20 4",
  help: "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M9.5 9.5 A2.5 2.5 0 1 1 12 13 V15 M12 18 V18.5",
  group: "M4 4 H14 V14 H4 Z M10 10 H20 V20 H10 Z",
  texlock: "M3 4 H15 V12 M3 4 V20 H11 M3 12 H15 M9 4 V20 M14 16 H21 V21 H14 Z M15.5 16 V14.5 A2 2 0 0 1 19.5 14.5 V16",
  grid: "M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z",
  list: "M4 6 H20 M4 12 H20 M4 18 H20",
  table: "M4 5 H20 V19 H4 Z M4 10 H20 M4 15 H20 M10 5 V19",
  chevronDown: "M6 9 L12 15 L18 9",
  chevronUp: "M6 15 L12 9 L18 15",
  chevronLeft: "M15 6 L9 12 L15 18",
  chevronRight: "M9 6 L15 12 L9 18",
  close: "M6 6 L18 18 M18 6 L6 18",
  window: "M4 6 H20 V18 H4 Z M4 9 H20 M7 7.5 H8",
  chain: "M7 12 H17 M9 8 A4 4 0 1 0 9 16 M15 8 A4 4 0 1 1 15 16",
  tieEnt: "M3 9 L8 6 L13 9 L13 15 L8 18 L3 15 Z M3 9 L8 12 L13 9 M8 12 V18 M18 4 A3 3 0 0 1 19.5 9.5 V11 H16.5 V9.5 A3 3 0 0 1 18 4 Z M17 13 H19",
  untieEnt: "M3 9 L8 6 L13 9 L13 15 L8 18 L3 15 Z M3 9 L8 12 L13 9 M8 12 V18 M18 7 A4 4 0 1 0 18 15 A4 4 0 1 0 18 7 M14 11 H22 M18 7 C16.5 9 16.5 13 18 15 C19.5 13 19.5 9 18 7",
  keepBoth: "M4 5 H10 V19 H4 Z M14 5 H20 V19 H14 Z",
  keepFront: "M4 5 H10 V19 H4 Z M4 9 L10 5 M4 13 L10 9 M4 17 L10 13 M14 5 H20 V19 H14 Z",
  keepBack: "M4 5 H10 V19 H4 Z M14 5 H20 V19 H14 Z M14 9 L20 5 M14 13 L20 9 M14 17 L20 13",
  scissors: "M6 7 A2.5 2.5 0 1 0 6 12 A2.5 2.5 0 1 0 6 7 M6 12 A2.5 2.5 0 1 0 6 17 A2.5 2.5 0 1 0 6 12 M8 10 L20 3 M8 14 L20 21",
  sides: "M12 3 L20 8 L17 18 L7 18 L4 8 Z",
  entity: "M12 3 L20 8 V16 L12 21 L4 16 V8 Z M12 12 L20 8 M12 12 L4 8 M12 12 V21",
  bulb: "M9 18 H15 M10 21 H14 M12 3 A6 6 0 0 0 8 13.5 L9 16 H15 L16 13.5 A6 6 0 0 0 12 3 Z",
  move: "M12 3 V21 M3 12 H21 M12 3 L9 6 M12 3 L15 6 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15",
  rotate: "M19.5 12 A7.5 7.5 0 1 1 14.2 4.8 M14.2 4.8 L18.5 3.5 M14.2 4.8 L15.5 9",
  scale: "M4 20 H11 M4 20 V13 M4 20 L20 4 M20 4 H13 M20 4 V11",
  wedge: "M4 18 L20 18 L20 6 Z M4 18 L12 14 L20 6 M12 14 L20 18",
  stairs: "M4 20 L4 16 L8 16 L8 12 L12 12 L12 8 L16 8 L16 4 L20 4 L20 20 Z",
  cylinder: "M12 4 A7 2.5 0 1 0 12 9 A7 2.5 0 1 0 12 4 M5 6.5 V17.5 A7 2.5 0 0 0 19 17.5 V6.5",
  sphere: "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M3 12 H21 M12 3 A4 9 0 1 0 12 21 A4 9 0 1 0 12 3",
  arch: "M4 20 V10 A8 8 0 0 1 20 10 V20 M8 20 V12 A4 4 0 0 1 16 12 V20",
  clipBoth: "M12 3 V21 M4 7 H9 V17 H4 Z M15 7 H20 V17 H15 Z",
  clipFront: "M12 3 V21 M4 7 H9 V17 H4 Z M15 7 H20 V17 H15 Z M4 7 L9 17 M4 17 L9 7",
  clipBack: "M12 3 V21 M4 7 H9 V17 H4 Z M15 7 H20 V17 H15 Z M15 7 L20 17 M15 17 L20 7",
  tie: "M4 8 L10 5 L16 8 L16 14 L10 17 L4 14 Z M16 11 H20 M18 9 L20 11 L18 13",
  untie: "M8 8 L14 5 L20 8 L20 14 L14 17 L8 14 Z M8 11 H4 M6 9 L4 11 L6 13",
  brush: "M4 20 C4 16 6 15 8 15 L13 10 L16 13 L11 18 C11 20 8 21 4 20 Z M13 10 L19 4 L21 6 L16 13",
  menu: "M4 7 H20 M4 12 H20 M4 17 H20",
  fullscreen: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15",
  file: "M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19",
  folder: "M3 6 H9 L11 8 H21 V19 H3 Z",
  cut: "M6 7 A2.5 2.5 0 1 0 6 12 A2.5 2.5 0 1 0 6 7 M6 12 A2.5 2.5 0 1 0 6 17 A2.5 2.5 0 1 0 6 12 M8 10 L20 3 M8 14 L20 21",
  copy: "M8 8 H20 V20 H8 Z M4 16 V4 H16",
  paste: "M8 4 H16 V7 H8 Z M6 6 H4 V21 H20 V6 H18 M9 12 H15 M9 16 H15",
  carve: "M4 4 H14 V9 H9 V14 H4 Z M12 12 H20 V20 H12 Z",
  hollow: "M3 3 H21 V21 H3 Z M8 8 H16 V16 H8 Z",
  ungroup: "M4 4 H11 V11 H4 Z M13 13 H20 V20 H13 Z M11 11 L13 13",
  gridSmall: "M4 4 H20 V20 H4 Z M4 9.3 H20 M4 14.6 H20 M9.3 4 V20 M14.6 4 V20",
  gridBig: "M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20",
  snap: "M4 20 L20 4 M8 20 L20 8 M4 16 L16 4",
  resources: "M4 18 H20 M6 18 V10 M11 18 V6 M16 18 V12",
  camera: "M4 8 H9 L10 6 H14 L15 8 H20 V18 H4 Z M12 10 A3 3 0 1 0 12 16 A3 3 0 1 0 12 10",
  eraser: "M4 16 L13 7 L19 13 L12 20 H8 Z M9 20 H20 M10 10 L16 16",
  line: "M4 20 L20 4",
  rect: "M4 6 H20 V18 H4 Z",
  fill: "M5 11 L11 5 L19 13 L13 19 Z M5 11 L13 19 M18 16 C18 18 19 19 20 19 C21 19 22 18 22 16 C22 15 20 13 20 13 C20 13 18 15 18 16 Z",
  pick: "M4 20 L10 14 M8 16 L14 10 L18 14 L12 20 Z M14 10 L17 7 L20 10 L17 13",
  text: "M5 6 H19 M12 6 V19 M9 19 H15",
};

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 14, className }: Props) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
