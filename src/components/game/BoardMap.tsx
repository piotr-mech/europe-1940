import { useEffect, useRef, useState } from "react";

import backgroundUrl from "@/assets/europe-regions.svg?url";
import { UNIT_ICON } from "@/components/game/unit-icons";
import { getGameData } from "@/lib/game-data";
import { dominantUnitType } from "@/lib/game-state";
import type { GameState, MapField } from "@/types";

const CANVAS_W = 1800;
const CANVAS_H = 1200;
const MIN_VIEW_W = 300; // max zoom-in: a 300-wide window over the 1800 canvas
const ZOOM_STEP = 0.85;
// Screen-space: a down/up pair closer than this is a click, not a pan.
const CLICK_THRESHOLD_PX = 5;
// SVG units: hit tolerance around a field center / army token rect.
const FIELD_HIT_TOLERANCE = 12;
const TOKEN_HIT_PADDING = 3;
/** Token offset below-right of its field (shared with the render below). */
const TOKEN_OFFSET_X = 6;
const TOKEN_OFFSET_Y = 5;
const TOKEN_W = 28;
const TOKEN_H = 18;
/** Dominant-unit icon inside the token, with padding. */
const ICON_SIZE = 14;
const ICON_PAD = 2;

interface BoardMapProps {
  state: GameState;
  selectedArmyId: string | null;
  /** Field ids the selected army can enter this turn (empty when nothing is selected). */
  reachable: ReadonlySet<string>;
  onArmyClick: (armyId: string) => void;
  /** Field click, or null when the click landed on the map background. */
  onFieldClick: (fieldId: string | null) => void;
}

interface View {
  x: number;
  y: number;
  w: number;
}

const FULL_VIEW: View = { x: 0, y: 0, w: CANVAS_W };

function clampView(view: View): View {
  const w = Math.min(Math.max(view.w, MIN_VIEW_W), CANVAS_W);
  const h = (w * CANVAS_H) / CANVAS_W;
  return {
    w,
    x: Math.min(Math.max(view.x, 0), CANVAS_W - w),
    y: Math.min(Math.max(view.y, 0), CANVAS_H - h),
  };
}

/** Zoom keeping the SVG point under the cursor stationary. */
function zoomAtCursor(view: View, clientX: number, clientY: number, rect: DOMRect, zoomIn: boolean): View {
  const scale = view.w / rect.width;
  const svgX = view.x + (clientX - rect.left) * scale;
  const svgY = view.y + (clientY - rect.top) * scale;
  const nextW = view.w * (zoomIn ? ZOOM_STEP : 1 / ZOOM_STEP);
  const ratio = nextW / view.w;
  return clampView({ x: svgX - (svgX - view.x) * ratio, y: svgY - (svgY - view.y) * ratio, w: nextW });
}

/**
 * Board-game map render (spec §23): geographic background, connections as
 * lines with white casing, fields as points in ownership colors (cities large
 * and labeled), army tokens. Wheel zooms at the cursor, dragging pans,
 * double-click resets the view. The root captures the pointer on every down,
 * so clicks are detected manually: a down/up pair under a screen-space
 * threshold hit-tests the nearest army token or field from the dataset
 * coordinates (plain onClick on children would be retargeted to the root).
 */
export function BoardMap({ state, selectedArmyId, reachable, onArmyClick, onFieldClick }: BoardMapProps) {
  const data = getGameData();
  const [view, setView] = useState<View>(FULL_VIEW);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; view: View } | null>(null);

  // Native non-passive wheel listener so preventDefault actually stops page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      setView((current) =>
        zoomAtCursor(current, event.clientX, event.clientY, svg.getBoundingClientRect(), event.deltaY < 0),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = drag.view.w / rect.width;
    setView(
      clampView({
        x: drag.view.x - (event.clientX - drag.clientX) * scale,
        y: drag.view.y - (event.clientY - drag.clientY) * scale,
        w: drag.view.w,
      }),
    );
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null) return;
    const moved = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY);
    if (moved < CLICK_THRESHOLD_PX) {
      handleClick(event.clientX, event.clientY);
    }
  };

  // A cancelled gesture (browser took over) is never a click — just drop the drag.
  const onPointerCancel = (): void => {
    dragRef.current = null;
  };

  // Hook-free derivations: the dataset is tiny — no memoization needed.
  const colorByCountry = new Map<string, string>(data.countries.map((country) => [country.id, country.color]));
  const fieldById = new Map(data.fields.map((field) => [field.id, field]));

  /** Manual click hit-test: tokens (offset from their field) win over field circles. */
  const handleClick = (clientX: number, clientY: number): void => {
    const svg = svgRef.current;
    if (svg === null) return;
    const rect = svg.getBoundingClientRect();
    const scale = view.w / rect.width;
    const x = view.x + (clientX - rect.left) * scale;
    const y = view.y + (clientY - rect.top) * scale;

    for (const army of state.armies) {
      const field = fieldById.get(army.fieldId);
      if (field === undefined) continue; // unreachable: validated state
      const tokenX = field.x + TOKEN_OFFSET_X;
      const tokenY = field.y + TOKEN_OFFSET_Y;
      if (
        x >= tokenX - TOKEN_HIT_PADDING &&
        x <= tokenX + TOKEN_W + TOKEN_HIT_PADDING &&
        y >= tokenY - TOKEN_HIT_PADDING &&
        y <= tokenY + TOKEN_H + TOKEN_HIT_PADDING
      ) {
        onArmyClick(army.id);
        return;
      }
    }

    let nearest: MapField | null = null;
    let nearestDistSq = FIELD_HIT_TOLERANCE * FIELD_HIT_TOLERANCE;
    for (const field of data.fields) {
      const distSq = (field.x - x) ** 2 + (field.y - y) ** 2;
      if (distSq <= nearestDistSq) {
        nearest = field;
        nearestDistSq = distSq;
      }
    }
    onFieldClick(nearest?.id ?? null);
  };

  // Deduplicate the symmetric connection list into unique edges.
  const edges: [MapField, MapField][] = [];
  const seenEdges = new Set<string>();
  for (const field of data.fields) {
    for (const id of field.connections) {
      const key = field.id < id ? `${field.id}|${id}` : `${id}|${field.id}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const other = fieldById.get(id);
      if (other === undefined) continue; // unreachable: validateGameData guards this
      edges.push([field, other]);
    }
  }

  const ownerColor = (fieldId: string): string => colorByCountry.get(state.fieldOwners[fieldId] ?? "") ?? "#94a3b8";
  const viewH = (view.w * CANVAS_H) / CANVAS_W;

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.w} ${viewH}`}
      className="block h-auto w-full cursor-grab touch-none select-none active:cursor-grabbing"
      role="img"
      aria-label="Mapa Europy 1940"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={() => {
        setView(FULL_VIEW);
      }}
    >
      <image href={backgroundUrl} x={0} y={0} width={CANVAS_W} height={CANVAS_H} />

      {/* Connections: white casing under a dark line keeps them readable over the pastel map. */}
      {edges.map(([a, b]) => (
        <g key={`${a.id}-${b.id}`}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f8fafc" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#475569" strokeWidth={2} strokeLinecap="round" />
        </g>
      ))}

      {/* Terrain fields: points in the owner's color. */}
      {data.fields
        .filter((field) => field.type !== "city")
        .map((field) => (
          <circle
            key={field.id}
            cx={field.x}
            cy={field.y}
            r={4}
            fill={ownerColor(field.id)}
            stroke="#f8fafc"
            strokeWidth={1.2}
          />
        ))}

      {/* Cities: larger points with a core dot and a haloed label. */}
      {data.fields
        .filter((field) => field.type === "city")
        .map((field) => (
          <g key={field.id}>
            <circle cx={field.x} cy={field.y} r={6} fill={ownerColor(field.id)} stroke="#f8fafc" strokeWidth={1.5} />
            <circle cx={field.x} cy={field.y} r={2} fill="#f8fafc" />
            <text
              x={field.x}
              y={field.y - 9}
              textAnchor="middle"
              fontSize={7}
              fontWeight={700}
              fill="#1e293b"
              stroke="#f8fafc"
              strokeWidth={1.5}
              paintOrder="stroke"
            >
              {field.name}
            </text>
          </g>
        ))}

      {/* Reach highlight: dashed ring on every field the selected army can enter. */}
      {[...reachable].map((fieldId) => {
        const field = fieldById.get(fieldId);
        if (field === undefined) return null;
        return (
          <circle
            key={`reach-${fieldId}`}
            cx={field.x}
            cy={field.y}
            r={field.type === "city" ? 10 : 8}
            fill="none"
            stroke="#f8fafc"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        );
      })}

      {/* Army tokens: owner color, dominant-unit image, unit count. */}
      {state.armies.map((army) => {
        const field = fieldById.get(army.fieldId);
        if (field === undefined) return null; // unreachable: validated state
        const tokenX = field.x + TOKEN_OFFSET_X;
        const tokenY = field.y + TOKEN_OFFSET_Y;
        const selected = army.id === selectedArmyId;
        return (
          <g key={army.id} style={{ cursor: army.owner === state.playerCountryId ? "pointer" : "default" }}>
            {selected && (
              <rect
                x={tokenX - 2}
                y={tokenY - 2}
                width={TOKEN_W + 4}
                height={TOKEN_H + 4}
                rx={3}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={1.5}
              />
            )}
            <rect
              x={tokenX}
              y={tokenY}
              width={TOKEN_W}
              height={TOKEN_H}
              rx={2}
              fill={colorByCountry.get(army.owner) ?? "#94a3b8"}
              stroke="#f8fafc"
              strokeWidth={1}
            />
            <image
              href={UNIT_ICON[dominantUnitType(army)]}
              x={tokenX + ICON_PAD}
              y={tokenY + (TOKEN_H - ICON_SIZE) / 2}
              width={ICON_SIZE}
              height={ICON_SIZE}
            />
            <text
              x={tokenX + ICON_PAD + ICON_SIZE + (TOKEN_W - ICON_SIZE - 2 * ICON_PAD) / 2}
              y={tokenY + TOKEN_H / 2 + 2}
              textAnchor="middle"
              fontSize={7}
              fontWeight={700}
              fill="#f8fafc"
            >
              {army.units.length}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
