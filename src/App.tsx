import { useLayoutEffect, useRef, useState } from "react";
import babyImg from "./assets/baby-no-border.png";
import "./App.css";


type Axis = {
  id: string;
  label: string;
  northStar: string;
};

type Ring = {
  id: string;
  label: string;
};

type NodeItem = {
  id: string;
  label: string;
  axisId: string;
  ringId: string;
  sequence: number;
  wrapWidth?: number | null; // optional per-node label wrap (px)
  rOverride?: number | null; // optional manual radial position (px from center)
};

// Built-in snapshot templates (module-scope so they’re safe to reference)
const BUILTIN_BLANK_SNAPSHOT: BabyIslandSnapshotV1 = {
  id: "builtin-blank",
  name: "Blank Island",
  createdAt: 0,
  updatedAt: 0,
  state: {
    v: 1,
    savedAt: 0,
    title: "Untitled Strategy",
    subtitle: "",
    axes: [],
    rings: [
      { id: "now", label: "Now" },
      { id: "next", label: "Next" },
      { id: "later", label: "Later" },
      { id: "uncommitted", label: "Uncommitted" },
    ],
    nodes: [],
  },
};


const uid = () => Math.random().toString(36).slice(2, 9);

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: cr.width, height: cr.height });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

// Legacy single-save key (we'll import it once if it exists)
const LEGACY_STORAGE_KEY = "baby-island-state-v1";

// New multi-snapshot storage
const SNAPSHOTS_KEY = "baby-island-snapshots-v1";
const ACTIVE_SNAPSHOT_KEY = "baby-island-active-snapshot-v1";

// Already used by your autosave toggle
const AUTOSAVE_KEY = "baby-island-autosave-v1";



type BabyIslandSavedStateV1 = {
  v: 1;
  savedAt: number;
  title: string;
  subtitle: string;
  axes: Axis[];
  rings: Ring[];
  nodes: NodeItem[];
};

type BabyIslandSnapshotV1 = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: BabyIslandSavedStateV1;
};


function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function readSnapshots(): BabyIslandSnapshotV1[] {
  const parsed = safeParseJSON<BabyIslandSnapshotV1[]>(localStorage.getItem(SNAPSHOTS_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

function ensureUncommittedRing(rings: Ring[]): Ring[] {
  const has = rings.some((r) => r.id === "uncommitted");
  if (has) return rings;

  return [...rings, { id: "uncommitted", label: "Uncommitted" }];
}

function migrateSnapshotsAddUncommitted(existing: BabyIslandSnapshotV1[]) {
  let changed = false;

  const next = existing.map((sn) => {
    const r = Array.isArray(sn.state?.rings) ? sn.state.rings : [];
    const upgraded = ensureUncommittedRing(r);

    if (upgraded !== r) {
      changed = true;
      return {
        ...sn,
        updatedAt: Date.now(),
        state: {
          ...sn.state,
          rings: upgraded,
        },
      };
    }

    return sn;
  });

  return { next, changed };
}


function writeSnapshots(next: BabyIslandSnapshotV1[]) {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
}

// Ensure a Blank Island snapshot exists (and return updated list)
function ensureBlankSnapshot(existing: BabyIslandSnapshotV1[]) {
  const hasBlank = existing.some((s) => s.id === "builtin-blank");
  if (hasBlank) return existing;

  const now = Date.now();
  const blank: BabyIslandSnapshotV1 = {
    id: "builtin-blank",
    name: "Blank Island",
    createdAt: now,
    updatedAt: now,
    state: {
      v: 1,
      savedAt: now,
      title: "Untitled Strategy",
      subtitle: "",
      axes: BLANK_AXES,
      rings: DEFAULT_RINGS,
      nodes: BLANK_NODES,
    },
  };

  // Put blank FIRST so it becomes the default
  return [blank, ...existing];
}


// -------------------- Export helpers --------------------
function slugifyFilename(input: string) {
  return (input || "baby-island")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function downloadTextFile(filename: string, text: string, mime = "application/json") {
  try {
    const blob = new Blob([text], { type: mime });
    downloadBlobFile(filename, blob);
  } catch (e) {
    console.warn("Download failed:", e);
  }
}

function downloadBlobFile(filename: string, blob: Blob) {
  try {
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("Download failed:", e);
  }
}



function getStrategyIdFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("strategy");
  } catch {
    return null;
  }
}

function setStrategyIdInUrl(strategyId: string | null) {
  try {
    const url = new URL(window.location.href);
    if (strategyId) url.searchParams.set("strategy", strategyId);
    else url.searchParams.delete("strategy");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}
const DEFAULT_NODE_WRAP_WIDTH = 150;
const NODE_LABEL_FONT_SIZE = 13;
const NODE_LABEL_LINE_H = 14;

// Wrap by word into approx maxChars per line (based on px width)
function wrapNodeLabel(label: string, wrapWidthPx: number) {
  const text = String(label ?? "").trim();
  if (!text) return [""];

  // rough char width at 13px for Outfit-ish fonts
  const approxCharPx = 7;
  const maxChars = Math.max(6, Math.floor((wrapWidthPx || DEFAULT_NODE_WRAP_WIDTH) / approxCharPx));

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  const pushCur = () => {
    if (cur.trim()) lines.push(cur.trim());
    cur = "";
  };

  for (const w of words) {
    // if a single word is huge, hard-break it
    if (w.length > maxChars) {
      if (cur) pushCur();
      for (let i = 0; i < w.length; i += maxChars) {
        lines.push(w.slice(i, i + maxChars));
      }
      continue;
    }

    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      pushCur();
      cur = w;
    }
  }
  pushCur();

  return lines.length ? lines : [text];
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function BlobLayer(props: {
  axes: Axis[];
  rings: Ring[];
  nodes: NodeItem[];
  cx2: number;
  cy2: number;
  ringNow: number;
  ringNext: number;
  ringLater: number;
  showNowBlob: boolean;
  showNextBlob: boolean;
  showLaterBlob: boolean;
}) {
  const {
    axes,
    rings,
    nodes,
    cx2,
    cy2,
    ringNow,
    ringNext,
    ringLater,
    showNowBlob,
    showNextBlob,
    showLaterBlob,
  } = props;

  // ringId -> rank based on current ring order (Now=0, Next=1, Later=2)
  const ringRank2 = rings.reduce((acc2, r, i) => {
    acc2[r.id] = i;
    return acc2;
  }, {} as Record<string, number>);

  // ringId -> actual ring radius
  const ringRadiusById: Record<string, number> = {};
  if (rings[0]) ringRadiusById[rings[0].id] = ringNow;
  if (rings[1]) ringRadiusById[rings[1].id] = ringNext;
  if (rings[2]) ringRadiusById[rings[2].id] = ringLater;

  // Same styling you already had
  const styles = [
    { fill: "#5beebb", stroke: "#1FD6A2", strokeWidth: 1 },
    { fill: "#16cc99", stroke: "#12C792", strokeWidth: 1 },
    { fill: "#159d6d", stroke: "#0D7F59", strokeWidth: 1.5 },
  ];

  // Smooth path helpers (Catmull-Rom -> cubic Bezier), closed loop
  const smoothClosedPathFromPoints = (pts: { x: number; y: number }[], tension = 1) => {
    if (pts.length < 3) {
      if (pts.length === 0) return "";
      const d0 = `M ${pts[0].x} ${pts[0].y}`;
      const lines = pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
      return `${d0} ${lines} Z`;
    }

    const n = pts.length;
    const d: string[] = [];
    d.push(`M ${pts[0].x} ${pts[0].y}`);

    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];

      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

      d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
    }

    d.push("Z");
    return d.join(" ");
  };

  // MUST mirror your dot positioning logic (spread affects "furthest dot")
  const spread = 18;

  // Back-compat + normalization:
  // - if rOverride <= ~1.5, treat as normalized (0..1 of ringLater)
  // - else treat as legacy px
  const overrideToPx = (n: NodeItem) => {
    const v = n.rOverride;
    if (v == null || !Number.isFinite(v)) return null;
    return v <= 1.5 ? v * ringLater : v;
  };

const dotRadiusForNodeOnAxis = (axisNodesOrdered: NodeItem[], n: NodeItem) => {
  // Mirror the exact positioning rules used by the chart:
  // - Normal rings (now/next/later) use base ring radius + spread.
  // - If there is ANY uncommitted node on this axis, then Later + Uncommitted share the OUTER band.
  //   In that case, Later’s radius is computed via even spacing in that band (NOT ringLater edge).

  const hasUncommitted = axisNodesOrdered.some((x) => x.ringId === "uncommitted");

  // Group by ring for spread math
  const nodesByRing = rings.reduce((acc, r) => {
    acc[r.id] = axisNodesOrdered.filter((x) => x.ringId === r.id);
    return acc;
  }, {} as Record<string, NodeItem[]>);

  const rawDotR = (node: NodeItem) => {
    const base = ringRadiusById[node.ringId] ?? ringLater;
    const ringList = nodesByRing[node.ringId] ?? [];
    const idx = ringList.findIndex((x) => x.id === node.id);
    const k = ringList.length;
    const offset = k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread;
    return base + offset;
  };

  // Shared outer band behavior
  if (hasUncommitted && (n.ringId === "later" || n.ringId === "uncommitted")) {
    // “Inner committed” means everything before the outer band (now/next only)
    const innerCommitted = axisNodesOrdered.filter(
      (x) => x.ringId !== "uncommitted" && x.ringId !== "later"
    );

    const innerCommittedMaxRawR =
      innerCommitted.length === 0 ? 0 : Math.max(...innerCommitted.map(rawDotR));

    const outerBand = axisNodesOrdered.filter(
      (x) => x.ringId === "later" || x.ringId === "uncommitted"
    );

    const orderedOuter = outerBand
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

    const i = orderedOuter.findIndex((x) => x.id === n.id);
    const k = orderedOuter.length;

    const start = innerCommittedMaxRawR; // after last now/next dot (or center)
    const end = ringLater;               // outer edge
    const gap = k <= 0 ? 0 : (end - start) / (k + 1);

    // Evenly spaced in the band; no spread needed
    return start + (i + 1) * gap;
  }

  // Default behavior (now/next/later without shared-band rule)
// Mirror the same "single later inset" polish used by the dots.
if (n.ringId === "later") {
  const hasUncommitted = axisNodesOrdered.some((x) => x.ringId === "uncommitted");
  const laterCount = axisNodesOrdered.filter((x) => x.ringId === "later").length;

  if (!hasUncommitted && laterCount === 1) {
    const SINGLE_LATER_INSET = 14;
    return rawDotR(n) - SINGLE_LATER_INSET;
  }
}

return rawDotR(n);

};


  // Build radii array for a cumulative target ring rank
  const EXCLUDED_FROM_BLOBS = new Set(["uncommitted"]);

  const buildRadiiForTargetRank = (targetRank: number) => {
    return axes.map((axis) => {
      const axisNodesOrdered = nodes
        .filter((n) => n.axisId === axis.id)
        .slice()
        .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

      const eligible = axisNodesOrdered.filter((n) => {
        if (EXCLUDED_FROM_BLOBS.has(n.ringId)) return false;
        return (ringRank2[n.ringId] ?? 0) <= targetRank;
      });

      // IMPORTANT: if there are no eligible nodes on this axis, keep it at center
      if (eligible.length === 0) return 0;

      return Math.max(
  ...eligible.map((n) => {
    // ✅ Manual nudge override wins (normalized-aware)
    const oPx = overrideToPx(n);
    if (oPx != null) {
      return Math.min(Math.max(0, oPx), ringLater - 10);
    }
    return dotRadiusForNodeOnAxis(axisNodesOrdered, n);

  })
);

    });
  };

  const radiiToPath = (radii: number[], tension = 1) => {
  const axisAngleOffset =
  axes.length === 4 ? Math.PI / 4 :
  axes.length === 8 ? Math.PI / 8 :
  0;


  const pts = radii.map((r, i) => {
    const angle = axisAngleOffset + (-Math.PI / 2 + (i * 2 * Math.PI) / axes.length);
    return {
      x: cx2 + r * Math.cos(angle),
      y: cy2 + r * Math.sin(angle),
    };
  });

  return smoothClosedPathFromPoints(pts, tension);
};


  // --- Animation state: we animate radii arrays, not 'd' ---
  const animRef = useRef<{
    raf: number | null;
    from: number[][];
    to: number[][];
    start: number;
    dur: number;
  } | null>(null);

  const currentRadiiRef = useRef<number[][]>([
    buildRadiiForTargetRank(0),
    buildRadiiForTargetRank(1),
    buildRadiiForTargetRank(2),
  ]);

  const [, forceRerender] = useState(0);

  // When inputs change, animate from current -> next
  useLayoutEffect(() => {
    const nextTo = [0, 1, 2].map((k) => buildRadiiForTargetRank(k));
    const from = currentRadiiRef.current.map((arr) => arr.slice());

    // stop any prior animation
    if (animRef.current?.raf) cancelAnimationFrame(animRef.current.raf);

    const start = performance.now();
    const dur = 360;

    animRef.current = { raf: null, from, to: nextTo, start, dur };

    const tick = (now: number) => {
      const a = animRef.current;
      if (!a) return;

      const tRaw = Math.min(1, Math.max(0, (now - a.start) / a.dur));
      const t = easeInOutCubic(tRaw);

      const blended = a.to.map((toArr, ringIdx) =>
        toArr.map((toV, i) => {
          const fromV = a.from[ringIdx]?.[i] ?? 0;
          return fromV + (toV - fromV) * t;
        })
      );

      currentRadiiRef.current = blended;
      forceRerender((v) => v + 1);

      if (tRaw < 1) {
        a.raf = requestAnimationFrame(tick);
      } else {
        // snap to exact target at the end
        currentRadiiRef.current = a.to.map((arr) => arr.slice());
        animRef.current = null;
        forceRerender((v) => v + 1);
      }
    };

    requestAnimationFrame(tick);

    return () => {
      if (animRef.current?.raf) cancelAnimationFrame(animRef.current.raf);
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axes, nodes, rings, ringNow, ringNext, ringLater]);


  // Ring visibility (your toggles)
  const showByIdx = [showNowBlob, showNextBlob, showLaterBlob];

  // Draw OUTSIDE -> INSIDE (Later -> Next -> Now)
  const order = [
    { idx: 2, id: "later" },
    { idx: 1, id: "next" },
    { idx: 0, id: "now" },
  ];

  return (
    <>
      {order.map(({ idx }) => {
        if (!showByIdx[idx]) return null;
        const radii = currentRadiiRef.current[idx] ?? [];
        const d = radiiToPath(radii, 1); // 👈 tension dial here if you want
        return (
          <path
            key={`blob-${idx}`}
            d={d}
            fill={styles[idx]?.fill ?? "rgba(12, 231, 168, 0.12)"}
            stroke={styles[idx]?.stroke ?? "rgba(12, 231, 168, 0.35)"}
            strokeWidth={styles[idx]?.strokeWidth ?? 1}
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}


export default function App() {
  // --- Defaults (used for Reset + as fallback) ---
  const DEFAULT_TITLE = "Example Product Strategy";
  const DEFAULT_SUBTITLE = "Baby Island — Workshop Edition";

  const DEFAULT_AXES: Axis[] = [
    {
      id: "discovery",
      label: "Discovery",
      northStar: "Users effortlessly find something they’ll love in minutes.",
    },
    {
      id: "personalization",
      label: "Personalization",
      northStar: "The experience feels tailored without feeling invasive.",
    },
    {
      id: "playback",
      label: "Playback",
      northStar: "Playback is instant, stable, and predictable everywhere.",
    },
    {
      id: "platform",
      label: "Platform",
      northStar: "The app feels fast and responsive on every device.",
    },
  ];

  const DEFAULT_RINGS: Ring[] = [
  { id: "now", label: "Now" },
  { id: "next", label: "Next" },
  { id: "later", label: "Later" },
  { id: "uncommitted", label: "Uncommitted" },
];

// Truly blank canvas (but rings are always present)
const BLANK_AXES: Axis[] = [];
const BLANK_NODES: NodeItem[] = [];


  const DEFAULT_NODES: NodeItem[] = [
    { id: uid(), label: "Search tuning", axisId: "discovery", ringId: "now", sequence: 1 },
    { id: uid(), label: "Better browse", axisId: "discovery", ringId: "next", sequence: 2 },
    { id: uid(), label: "Startup improvements", axisId: "playback", ringId: "now", sequence: 1 },
    { id: uid(), label: "Scroll reduction", axisId: "platform", ringId: "next", sequence: 2 },
  ];

  // --- State ---
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);

  const [axes, setAxes] = useState<Axis[]>(DEFAULT_AXES);
  const [rings, setRings] = useState<Ring[]>(DEFAULT_RINGS);
  const [nodes, setNodes] = useState<NodeItem[]>(DEFAULT_NODES);

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTOSAVE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const autosaveTimerRef = useRef<number | null>(null);
  const hasHydratedRef = useRef(false);

  const stageRef = useRef<HTMLDivElement | null>(null);

  // For PNG export (serialize the SVG)
  const svgExportRef = useRef<SVGSVGElement | null>(null);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  // Clamp tooltip to the visible stage so it never goes off-screen
const clampTooltipToStage = (x: number, y: number) => {
  const el = stageRef.current;
  if (!el) return { x, y };

  // These match your tooltip box styling below
  const PAD = 8;
  const TIP_W = 280; // matches maxWidth: 280
  const TIP_H = 120; // safe estimate; we’ll adjust with a little margin

  const maxX = Math.max(PAD, el.clientWidth - TIP_W - PAD);
  const maxY = Math.max(PAD, el.clientHeight - TIP_H - PAD);

  return {
    x: Math.min(Math.max(x, PAD), maxX),
    y: Math.min(Math.max(y, PAD), maxY),
  };
};

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const babySpinAnimRef = useRef<SVGAnimateTransformElement | null>(null);
const babySpinDirRef = useRef<1 | -1>(1); // 1 = clockwise, -1 = counter-clockwise


  // -------------------- Drag state (click + drag) --------------------
type DragPos = { x: number; y: number };

const DRAG_THRESHOLD_PX = 5;

const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
const [dragPos, setDragPos] = useState<DragPos | null>(null);

const activePointerIdRef = useRef<number | null>(null);
const dragStartClientRef = useRef<{ x: number; y: number } | null>(null);
const didDragRef = useRef(false);

// Inline edit: manual double-click tracker (SVG dblclick is unreliable with pointer capture)
const lastPointerDownRef = useRef<{ id: string; t: number } | null>(null);


  const nodeRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showNodes, setShowNodes] = useState(true);
  const [nodeTooltip, setNodeTooltip] = useState<{ x: number; y: number; text: string } | null>(
    null
  );
  const [showNowBlob, setShowNowBlob] = useState(true);
  const [showNextBlob, setShowNextBlob] = useState(true);
  const [showLaterBlob, setShowLaterBlob] = useState(true);

  // --- Ring toggle button styling ---
  const RING_COLORS: Record<string, string> = {
    now: "#5beebb",   // light green
    next: "#16cc99",  // medium green
    later: "#159d6d", // darker green
  };

  const ringToggleBtnStyle = (on: boolean, color: string) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${color}`,
    background: on ? color : "rgba(0,0,0,0.04)",
    color: "#111",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
    lineHeight: 1,
    boxShadow: on ? "0 6px 18px rgba(0,0,0,0.10)" : "none",
  });

  const ringMasterBtnStyle = (on: boolean) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #111",
    background: on ? "#111" : "#fff",
    color: on ? "#fff" : "#111",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    lineHeight: 1,
    boxShadow: on ? "0 6px 18px rgba(0,0,0,0.10)" : "none",
  });

  const [babySpin, setBabySpin] = useState(0);
  const [snapshots, setSnapshots] = useState<BabyIslandSnapshotV1[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
   const [copiedAt, setCopiedAt] = useState<number | null>(null);

  // --- Inline node label edit (presentation mode) ---
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeValue, setEditingNodeValue] = useState<string>("");
  const [editingNodePos, setEditingNodePos] = useState<{ left: number; top: number } | null>(null);
  const editNodeInputRef = useRef<HTMLInputElement | null>(null);

  // --- Per-node wrap resize (Slides-style drag handle) ---
const [resizingWrapNodeId, setResizingWrapNodeId] = useState<string | null>(null);
const wrapResizeStartRef = useRef<{ x: number; w: number } | null>(null);


  // -------------------- Import (data file JSON) --------------------
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const importStrategyFromFile = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = safeParseJSON<any>(raw);

      if (!parsed || parsed.format !== "baby-island-export-v1" || !parsed.state) {
        window.alert("That file doesn’t look like a Baby Island export.");
        return;
      }

      const s = parsed.state as BabyIslandSavedStateV1;

      // Minimal validation / normalization
      const nextState: BabyIslandSavedStateV1 = {
        v: 1,
        savedAt: Date.now(),
        title: typeof s.title === "string" ? s.title : "Imported Strategy",
        subtitle: typeof s.subtitle === "string" ? s.subtitle : "",
        axes: Array.isArray(s.axes) ? s.axes : [],
        rings: ensureUncommittedRing(Array.isArray(s.rings) ? s.rings : DEFAULT_RINGS),
        nodes: Array.isArray(s.nodes) ? s.nodes : [],
      };

      const baseName =
        (typeof parsed.snapshotName === "string" && parsed.snapshotName.trim()) ||
        (file.name ? file.name.replace(/\.[^/.]+$/, "") : "") ||
        "Imported Strategy";

      // Create as NEW snapshot and make active
      createSnapshot(`${baseName} (Imported)`, true, nextState);

      // reset the input so importing the same file twice still triggers change
      if (importFileInputRef.current) importFileInputRef.current.value = "";
    } catch (e) {
      console.warn("Import failed:", e);
      window.alert("Import failed. The file may be corrupted.");
    }
  };


  const copyStrategyLink = async () => {
  if (!activeSnapshotId) return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("strategy", activeSnapshotId);

    await navigator.clipboard.writeText(url.toString());
    setCopiedAt(Date.now());

    // auto-clear the badge after 1.5s
    setTimeout(() => setCopiedAt(null), 1500);
  } catch (e) {
    console.warn("Clipboard copy failed:", e);

    // fallback
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("strategy", activeSnapshotId);
      window.prompt("Copy this link:", url.toString());
    } catch {}
  }
};



const [ringsOpen, setRingsOpen] = useState(false);
const [nodesOpen, setNodesOpen] = useState(false);

// Per-axis expanded state (default: collapsed)
const [expandedAxisIds, setExpandedAxisIds] = useState<Record<string, boolean>>({});

const isAxisExpanded = (axisId: string) => !!expandedAxisIds[axisId];

const toggleAxisExpanded = (axisId: string) => {
  setExpandedAxisIds((prev) => ({ ...prev, [axisId]: !prev[axisId] }));
};

const expandAxis = (axisId: string) => {
  setExpandedAxisIds((prev) => (prev[axisId] ? prev : { ...prev, [axisId]: true }));
};


const [leftCollapsed, setLeftCollapsed] = useState(false);
const [guidebookOpen, setGuidebookOpen] = useState(false);

// --- Quick Start ---
const [qsAxes, setQsAxes] = useState<number>(4);
const [qsNodesPerAxis, setQsNodesPerAxis] = useState<number>(3);

const quickStart = () => {
  // clamp for sanity (no child locks, just guardrails)
  const axisCount = Math.max(1, Math.min(16, Math.floor(qsAxes || 0)));
  const nodesPerAxis = Math.max(0, Math.min(20, Math.floor(qsNodesPerAxis || 0)));

  const newAxes: Axis[] = Array.from({ length: axisCount }, (_, i) => ({
    id: `axis-${uid()}`,
    label: `Axis ${i + 1}`,
    northStar: `North Star ${i + 1}`,
  }));

  const newNodes: NodeItem[] = newAxes.flatMap((ax) =>
    Array.from({ length: nodesPerAxis }, (_, j) => ({
      id: uid(),
label: `Node ${j + 1}`,
axisId: ax.id,
ringId: "uncommitted",
sequence: j + 1,
wrapWidth: null,

    }))
  );

  // Apply in one “transaction”
  setAxes(newAxes);
  setNodes(newNodes);

  // UX: open the editor and collapse sub-sections by default
  setNodesOpen(true);
  setExpandedAxisIds({});

  // Optional: clear selection
  setSelectedNodeId(null);
};




  // --- Save / Load / Reset ---
  const buildStatePayload = (): BabyIslandSavedStateV1 => ({
    v: 1,
    savedAt: Date.now(),
    title,
    subtitle,
    axes,
    rings,
    nodes,
  });

  // -------------------- Export menu (JSON / PNG / CSV) --------------------
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useLayoutEffect(() => {
    if (!exportMenuOpen) return;

    const onDocDown = (e: MouseEvent) => {
      // Close menu on any outside click
      // (we’ll stopPropagation on the menu container)
      setExportMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [exportMenuOpen]);

  const getActiveSnapshotName = () => {
    return (
      (activeSnapshotId && snapshots.find((s) => s.id === activeSnapshotId)?.name) || "Baby Island"
    );
  };

  // 1) JSON export (data file)
  const exportAsJson = () => {
    if (!activeSnapshotId) return;

    const state = buildStatePayload();
    const snapName = getActiveSnapshotName();

    const exportObj = {
      format: "baby-island-export-v1",
      exportedAt: Date.now(),
      snapshotId: activeSnapshotId,
      snapshotName: snapName,
      state,
    };

    const filename = `${slugifyFilename(snapName)}.babyisland.json`;
    downloadTextFile(filename, JSON.stringify(exportObj, null, 2), "application/json");
  };

  // Helpers for CSV escaping
  const csvEscape = (v: any) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  // 2) CSV export (Axis Name, North Star, Axis Order, Node Name, Node Ring, Node Order)
  const exportAsCsv = () => {
    const snapName = getActiveSnapshotName();

    const axisIndexById = axes.reduce((acc, a, i) => {
      acc[a.id] = i;
      return acc;
    }, {} as Record<string, number>);

    const axisById = axes.reduce((acc, a) => {
      acc[a.id] = a;
      return acc;
    }, {} as Record<string, Axis>);

    const ringLabelById = rings.reduce((acc, r) => {
      acc[r.id] = r.label;
      return acc;
    }, {} as Record<string, string>);

    const header = ["Axis Name", "North Star", "Axis Order", "Node Name", "Node Ring", "Node Order"];

    // Sort rows to be stable/readable: axis order -> node order -> name
    const sortedNodes = nodes.slice().sort((a, b) => {
      const axA = axisIndexById[a.axisId] ?? 9999;
      const axB = axisIndexById[b.axisId] ?? 9999;
      if (axA !== axB) return axA - axB;
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      return a.label.localeCompare(b.label);
    });

    const rows = sortedNodes.map((n) => {
      const ax = axisById[n.axisId];
      const axisName = ax?.label ?? "";
      const northStar = ax?.northStar ?? "";
      const axisOrder = (axisIndexById[n.axisId] ?? -1) + 1; // 1-based
      const nodeName = n.label ?? "";
      const nodeRing = ringLabelById[n.ringId] ?? n.ringId ?? "";
      const nodeOrder = n.sequence ?? "";

      return [axisName, northStar, axisOrder, nodeName, nodeRing, nodeOrder].map(csvEscape).join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    const filename = `${slugifyFilename(snapName)}.csv`;
    downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  };

  // 3) PNG export (high-res chart only)
  const exportAsPng = async () => {
    const snapName = getActiveSnapshotName();
    const svgEl = svgExportRef.current;
    if (!svgEl) {
      window.alert("Couldn’t find the chart SVG to export.");
      return;
    }

    // Helper: convert an asset URL to a data URL (for inlining <image>)
    const toDataUrl = async (url: string): Promise<string | null> => {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("FileReader failed"));
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("toDataUrl failed:", e);
        return null;
      }
    };

    try {
      // 1) Best-effort: wait for fonts to be ready before we serialize/rasterize
      try {
        // @ts-ignore
        await (document as any).fonts?.ready;
      } catch {
        // ignore
      }

      // Determine dimensions from viewBox (source of truth)
      const vb = svgEl.getAttribute("viewBox"); // "0 0 w h"
      let vbW = 1000;
      let vbH = 800;

      if (vb) {
        const parts = vb.split(/\s+/).map((x) => parseFloat(x));
        if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
          vbW = parts[2];
          vbH = parts[3];
        }
      } else {
        const r = svgEl.getBoundingClientRect();
        vbW = Math.max(1, Math.round(r.width));
        vbH = Math.max(1, Math.round(r.height));
      }

      // Serialize SVG
      const serializer = new XMLSerializer();
      let svgText = serializer.serializeToString(svgEl);

      // Ensure namespaces exist
      if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgText = svgText.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!svgText.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
        svgText = svgText.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      // CRITICAL: force explicit width/height so rasterizer has intrinsic size
      const hasWidth = /\swidth="/.test(svgText);
      const hasHeight = /\sheight="/.test(svgText);
      if (!hasWidth || !hasHeight) {
        svgText = svgText.replace("<svg", `<svg width="${vbW}" height="${vbH}"`);
      }

      // 2) Inline a font style into the exported SVG (helps the rasterizer)
      const fontStyle = `
        /* Best-effort: force the same font stack you use in-app */
        text, tspan {
          font-family: "Outfit", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
        }
      `.trim();

      // inject style right after <svg ...>
      svgText = svgText.replace(/<svg([^>]*)>/, `<svg$1><style><![CDATA[${fontStyle}]]></style>`);

      // 3) Inline the baby image as a data URL so it always renders in the export
      // babyImg is your imported asset URL string
      const babyUrl = String(babyImg);
      const babyDataUrl = await toDataUrl(babyUrl);
      if (babyDataUrl) {
        // Replace any occurrence of the baby asset URL in the serialized SVG
        // (covers href="...", href='...', and cases where Vite rewrites URLs)
        svgText = svgText.split(babyUrl).join(babyDataUrl);
      } else {
        console.warn("PNG export: could not inline baby image (continuing).");
      }

      const scale = 3; // bump to 4 if you want more resolution
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vbW * scale);
      canvas.height = Math.round(vbH * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      // White background for decks
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render SVG into an <img>
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        try {
          // Draw to destination size (prevents corner-crop surprises)
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (pngBlob) => {
              if (!pngBlob) {
                window.alert("PNG export failed (canvas toBlob returned null).");
                return;
              }
              const filename = `${slugifyFilename(snapName)}.png`;
              downloadBlobFile(filename, pngBlob);
            },
            "image/png"
          );
        } finally {
          URL.revokeObjectURL(url);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        window.alert("PNG export failed to render the SVG.");
      };

      img.src = url;
    } catch (e) {
      console.warn("PNG export failed:", e);
      window.alert("PNG export failed.");
    }
  };



  const onExportPick = (kind: "json" | "png" | "csv") => {
    setExportMenuOpen(false);
    if (kind === "json") exportAsJson();
    if (kind === "png") exportAsPng();
    if (kind === "csv") exportAsCsv();
  };



  const loadSnapshotIntoState = (snap: BabyIslandSnapshotV1) => {
    const s = snap.state;
    setTitle(s.title ?? DEFAULT_TITLE);
    setSubtitle(s.subtitle ?? DEFAULT_SUBTITLE);
    setAxes(Array.isArray(s.axes) ? s.axes : DEFAULT_AXES);
    setRings(Array.isArray(s.rings) ? s.rings : DEFAULT_RINGS);
    setNodes(Array.isArray(s.nodes) ? s.nodes : DEFAULT_NODES);
    setLastSavedAt(s.savedAt ?? snap.updatedAt ?? null);

    // clear selection if node no longer exists
    setSelectedNodeId((prev) => (prev && s.nodes?.some((n) => n.id === prev) ? prev : null));
  };

  const saveCurrentSnapshot = (reason: "manual" | "autosave" = "manual") => {
    if (!activeSnapshotId) return;

    try {
      const payload = buildStatePayload();
      setLastSavedAt(payload.savedAt);

      setSnapshots((prev) => {
        const next = prev.map((sn) => {
          if (sn.id !== activeSnapshotId) return sn;
          return {
            ...sn,
            updatedAt: Date.now(),
            state: payload,
          };
        });
        try {
          writeSnapshots(next);
          localStorage.setItem(ACTIVE_SNAPSHOT_KEY, activeSnapshotId);
        } catch (e) {
          console.warn("Snapshot save failed:", e);
        }
        return next;
      });
    } catch (e) {
      console.warn("Snapshot save failed:", e);
    }
  };

 const createSnapshot = (
  name: string,
  makeActive = true,
  overrideState?: BabyIslandSavedStateV1
) => {


    const now = Date.now();
    const snap: BabyIslandSnapshotV1 = {
      id: uid(),
      name,
      createdAt: now,
      updatedAt: now,
      state: overrideState ?? buildStatePayload(),
    };

    setSnapshots((prev) => {
      const next = [snap, ...prev];
      try {
        writeSnapshots(next);
      } catch (e) {
        console.warn("Create snapshot failed:", e);
      }
      return next;
    });

    if (makeActive) {
  setActiveSnapshotId(snap.id);
  try {
    localStorage.setItem(ACTIVE_SNAPSHOT_KEY, snap.id);
  } catch {}
  setStrategyIdInUrl(snap.id);
  loadSnapshotIntoState(snap);


  // ✅ Ensure the UI switches to the new snapshot immediately
  loadSnapshotIntoState(snap);
}

setLastSavedAt(snap.state.savedAt);

  };

  const loadSnapshotById = (id: string) => {
    const found = snapshots.find((s) => s.id === id);
    if (!found) return;

    setActiveSnapshotId(id);
    try {
      localStorage.setItem(ACTIVE_SNAPSHOT_KEY, id);
    } catch {}
    setStrategyIdInUrl(id);

    loadSnapshotIntoState(found);
  };

  const renameSnapshot = (id: string, nextName: string) => {
    setSnapshots((prev) => {
      const next = prev.map((sn) => (sn.id === id ? { ...sn, name: nextName } : sn));
      try {
        writeSnapshots(next);
      } catch (e) {
        console.warn("Rename failed:", e);
      }
      return next;
    });
  };

  const deleteSnapshot = (id: string) => {
    setSnapshots((prev) => {
      const next = prev.filter((sn) => sn.id !== id);
      try {
        writeSnapshots(next);
      } catch (e) {
        console.warn("Delete failed:", e);
      }
      return next;
    });

    // If you deleted the active one, fall back to the next available
    if (activeSnapshotId === id) {
      const remaining = snapshots.filter((sn) => sn.id !== id);
      const nextActive = remaining[0]?.id ?? null;
      setActiveSnapshotId(nextActive);

      try {
        if (nextActive) localStorage.setItem(ACTIVE_SNAPSHOT_KEY, nextActive);
        else localStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
      } catch {}

      setStrategyIdInUrl(nextActive);

      if (nextActive) {
        const nextSnap = snapshots.find((s) => s.id === nextActive);
        if (nextSnap) loadSnapshotIntoState(nextSnap);
      } else {
        // no snapshots left — reset working state
        resetWorkingState();
      }
    }
  };

  const duplicateSnapshot = (id: string) => {
    const src = snapshots.find((s) => s.id === id);
    if (!src) return;

    const now = Date.now();
    const copy: BabyIslandSnapshotV1 = {
      id: uid(),
      name: `${src.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      state: {
        ...src.state,
        savedAt: now,
      },
    };

    setSnapshots((prev) => {
      const next = [copy, ...prev];
      try {
        writeSnapshots(next);
      } catch (e) {
        console.warn("Duplicate failed:", e);
      }
      return next;
    });

    setActiveSnapshotId(copy.id);
    try {
      localStorage.setItem(ACTIVE_SNAPSHOT_KEY, copy.id);
    } catch {}
    setStrategyIdInUrl(copy.id);

    loadSnapshotIntoState(copy);
  };

  // Reset to your default demo content (existing behavior)
const resetWorkingState = () => {
  setTitle(DEFAULT_TITLE);
  setSubtitle(DEFAULT_SUBTITLE);
 setAxes(BLANK_AXES);
setRings(DEFAULT_RINGS);
setNodes(BLANK_NODES);
  setSelectedNodeId(null);
  setLastSavedAt(null);
};

// NEW: truly blank canvas for fresh strategies
const resetWorkingStateBlank = () => {
  setTitle("Untitled Strategy");
  setSubtitle("");
  setAxes(DEFAULT_AXES);
  setRings(DEFAULT_RINGS);
  setNodes([]); // 👈 key difference
  setSelectedNodeId(null);
  setLastSavedAt(null);
};

// -------------------- Built-in Snapshots --------------------


// Example island
const BUILTIN_EXAMPLE_SNAPSHOT: BabyIslandSnapshotV1 = {
  id: "builtin-vision-workshop-example",
  name: "Workshop Example",
  createdAt: 1771006683761,
  updatedAt: 1771006683761,
  state: {
    v: 1,
    savedAt: 1771006683761,
    title: "Workshop Example",
    subtitle: "Version 1",
    axes: [
      {
        id: "axis-uldb3kn",
        label: "Effortless Interaction",
        northStar:
          "The product is built to listen. It becomes a trusted companion by listening, responding, and adapting to what you want in the moment, replacing static navigation with ongoing dialogue.",
      },
      {
        id: "axis-nau02ev",
        label: "Adaptive Expression",
        northStar:
          "The product feels uniquely yours. The experience evolves visually and functionally to reflect who you are, what you love, and how you engage.",
      },
      {
        id: "axis-a3f6d9a",
        label: "Customization",
        northStar:
          "You shape your product experience. From powerful controls to deeper customization to subscription flexibility, the product gives users meaningful agency so that the experience works the way they want it to.",
      },
      {
        id: "axis-dg24lcs",
        label: "Beyond Video",
        northStar:
          "Stories don’t end when the credits roll. The product transforms storytelling into living worlds that audiences can explore, extend, and return to.",
      },
      {
        id: "axis-9j05408",
        label: "Fandom",
        northStar:
          "The product is built for a thousand niches, not one average user. Every user unlocks power in their own way through features and experiences designed to go deep, not wide.",
      },
      {
        id: "axis-i8xea5h",
        label: "Cross-Functional",
        northStar:
          "The product is the front door to the broader company. It connects audiences to merchandise, events, and experiences outside of the home.",
      },
      {
        id: "axis-cx3a5mf",
        label: "Quality",
        northStar:
          "The product is reliable, consistent, and modern. It works as expected, and it impresses with cutting edge technology atop a rock-solid foundation.",
      },
    ],
    rings: DEFAULT_RINGS,
    nodes: [
      {
        "id": "wlkrczh",
        "label": "Audio experiences",
        "axisId": "axis-dg24lcs",
        "ringId": "now",
        "sequence": 2,
        "wrapWidth": 134,
        "rOverride": 131.00196608079077
      },
      {
        "id": "h5sr8i5",
        "label": "Interactive storytelling",
        "axisId": "axis-dg24lcs",
        "ringId": "next",
        "sequence": 3,
        "rOverride": 179.8127569966473,
        "wrapWidth": 173
      },
      {
        "id": "1h5xf2p",
        "label": "Put yourself in a scene",
        "axisId": "axis-dg24lcs",
        "ringId": "uncommitted",
        "sequence": 4,
        "wrapWidth": 173,
        "rOverride": null
      },
      {
        "id": "5q9rj1j",
        "label": "Conversational UX",
        "axisId": "axis-uldb3kn",
        "ringId": "later",
        "sequence": 3
      },
      {
        "id": "uxf56i4",
        "label": "Advanced filtering",
        "axisId": "axis-uldb3kn",
        "ringId": "next",
        "sequence": 2,
        "wrapWidth": 130,
        "rOverride": 0.7333355095938641
      },
      {
        "id": "qyveedi",
        "label": "Personalized user education",
        "axisId": "axis-nau02ev",
        "ringId": "uncommitted",
        "sequence": 3,
        "wrapWidth": 195
      },
      {
        "id": "ltptxbj",
        "label": "Cohort-specific features",
        "axisId": "axis-nau02ev",
        "ringId": "now",
        "sequence": 1,
        "wrapWidth": 180,
        "rOverride": 0.45016174242430756
      },
      {
        "id": "43ijjmd",
        "label": "Reminders",
        "axisId": "axis-a3f6d9a",
        "ringId": "now",
        "sequence": 2,
        "rOverride": 0.6032282507792049
      },
      {
        "id": "kymz7zw",
        "label": "Rewards",
        "axisId": "axis-9j05408",
        "ringId": "uncommitted",
        "sequence": 3
      },
      {
        "id": "260mc7n",
        "label": "Fandom 101",
        "axisId": "axis-9j05408",
        "ringId": "now",
        "sequence": 1,
        "rOverride": 112.59034360529706
      },
      {
        "id": "bxs1kos",
        "label": "Easter eggs",
        "axisId": "axis-9j05408",
        "ringId": "next",
        "sequence": 2
      },
      {
        "id": "jdbovrg",
        "label": "Cart integration",
        "axisId": "axis-i8xea5h",
        "ringId": "uncommitted",
        "sequence": 3,
        "wrapWidth": 125,
        "rOverride": 0.8909441295419214
      },
      {
        "id": "psjfovt",
        "label": "Routines",
        "axisId": "axis-nau02ev",
        "ringId": "next",
        "sequence": 2,
        "rOverride": 0.674268568913468
      },
      {
        "id": "2kmpi5d",
        "label": "Tuning",
        "axisId": "axis-a3f6d9a",
        "ringId": "later",
        "sequence": 3,
        "rOverride": 0.8576322445038916
      },
      {
        "id": "2wkja25",
        "label": "User interests",
        "axisId": "axis-a3f6d9a",
        "ringId": "now",
        "sequence": 1,
        "wrapWidth": 139,
        "rOverride": 0.24148468815711166
      },
      {
        "id": "c53i4ui",
        "label": "Gen AI fan fiction",
        "axisId": "axis-dg24lcs",
        "ringId": "uncommitted",
        "sequence": 5,
        "rOverride": 249.5933838346448
      },
      {
        "id": "48tybws",
        "label": "Discovery prompts",
        "axisId": "axis-uldb3kn",
        "ringId": "now",
        "sequence": 1,
        "wrapWidth": 97,
        "rOverride": 109.0218808727737
      },
      {
        "id": "57lblx8",
        "label": "Shop tab v2",
        "axisId": "axis-i8xea5h",
        "ringId": "uncommitted",
        "sequence": 1,
        "rOverride": 0.50083690602418,
        "wrapWidth": 88
      },
      {
        "id": "e9ioiz3",
        "label": "Improve subtitles",
        "axisId": "axis-cx3a5mf",
        "ringId": "now",
        "sequence": 1,
        "wrapWidth": 76,
        "rOverride": 0.4145904806129118
      },
      {
        "id": "m5zui8p",
        "label": "Faster startup",
        "axisId": "axis-cx3a5mf",
        "ringId": "later",
        "sequence": 2,
        "wrapWidth": 105,
        "rOverride": 0.9053481214958646
      }
    ],
  },
};



// --- One-time init: load snapshots, import legacy if present, pick active via URL/localStorage ---
useLayoutEffect(() => {
  try {
    let existing = readSnapshots();

    // 1) Import legacy single-save ONCE (only if snapshots are empty)
    if (existing.length === 0) {
      const legacy = safeParseJSON<BabyIslandSavedStateV1>(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy && legacy.v === 1) {
        const now = Date.now();
        const imported: BabyIslandSnapshotV1 = {
          id: uid(),
          name: "Imported",
          createdAt: now,
          updatedAt: now,
          state: legacy,
        };
        existing = [imported];

        try {
          writeSnapshots(existing);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {}
      }
    }

    // 2) If still empty, seed Blank + Example (blank first)
    if (existing.length === 0) {
      const now = Date.now();

      const blank: BabyIslandSnapshotV1 = {
        ...BUILTIN_BLANK_SNAPSHOT,
        createdAt: now,
        updatedAt: now,
        state: {
          ...BUILTIN_BLANK_SNAPSHOT.state,
          savedAt: now,
          // Use your real in-app rings (includes uncommitted)
          rings: DEFAULT_RINGS,
          axes: BLANK_AXES,
          nodes: BLANK_NODES,
        },
      };

      const example: BabyIslandSnapshotV1 = {
        ...BUILTIN_EXAMPLE_SNAPSHOT,
        // keep example timestamps as-is (or refresh if you want)
      };

      existing = [blank, example];

      try {
        writeSnapshots(existing);
      } catch {}
    }

    // 3) Migrate any older snapshots to ensure "uncommitted" ring exists
    const migrated = migrateSnapshotsAddUncommitted(existing);
    existing = migrated.next;
    if (migrated.changed) {
      try {
        writeSnapshots(existing);
      } catch {}
    }

    setSnapshots(existing);

    // 4) Pick active snapshot via URL > localStorage > first item
    const fromUrl = getStrategyIdFromUrl();
    const fromLocal = localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
    const preferredId = fromUrl || fromLocal;

    const preferred = preferredId ? existing.find((s) => s.id === preferredId) : null;
    const initial = preferred || existing[0] || null;

    if (initial) {
      setActiveSnapshotId(initial.id);
      try {
        localStorage.setItem(ACTIVE_SNAPSHOT_KEY, initial.id);
      } catch {}
      setStrategyIdInUrl(initial.id);
      loadSnapshotIntoState(initial);
    }

    // 5) Mark hydration complete so autosave can run safely
    hasHydratedRef.current = true;
  } catch (e) {
    console.warn("Init failed:", e);
    hasHydratedRef.current = true;
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);



  // ----- Chart constants (legacy / harmless even though SVG now sizes dynamically) -----
  const cx = 500;
  const cy = 450;
  const outerR = 400;
  const ringR = { now: 160, next: 280, later: 400 };

  // ----- Ring ordering + validation (SAFE: all computed before return) -----
  const ringRank = rings.reduce((acc, r, i) => {
    acc[r.id] = i; // Now=0, Next=1, Later=2 (based on ring order)
    return acc;
  }, {} as Record<string, number>);

  const axisWarnings = axes.reduce((acc, axis) => {
    // IMPORTANT: validate within an axis using SEQUENCE order
    const axisNodes = nodes
      .filter((n) => n.axisId === axis.id)
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

    const warnings: string[] = [];

    for (let i = 1; i < axisNodes.length; i++) {
      const prev = axisNodes[i - 1];
      const curr = axisNodes[i];

      const prevRank = ringRank[prev.ringId] ?? 0;
      const currRank = ringRank[curr.ringId] ?? 0;
      if (prev.ringId === "uncommitted" || curr.ringId === "uncommitted") continue;


      // if sequence increases but ring goes backwards, warn
      if (currRank < prevRank) {
        const prevRingLabel = rings.find((r) => r.id === prev.ringId)?.label ?? prev.ringId;
        const currRingLabel = rings.find((r) => r.id === curr.ringId)?.label ?? curr.ringId;

        warnings.push(
          `Seq ${curr.sequence} (“${curr.label}”) is ${currRingLabel} but comes after a ${prevRingLabel} item (“${prev.label}”).`
        );
      }
    }

    if (warnings.length) acc[axis.id] = warnings;
    return acc;
  }, {} as Record<string, string[]>);

  // Move a node up/down within its AXIS order, then renumber sequence 1..N for that axis
  const moveNodeInAxis = (axisId: string, nodeId: string, direction: -1 | 1) => {
    setNodes((prev) => {
      const axisNodes = prev
        .filter((n) => n.axisId === axisId)
        .slice()
        .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

      const idx = axisNodes.findIndex((n) => n.id === nodeId);
      if (idx === -1) return prev;

      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= axisNodes.length) return prev;

      // swap in the ordered list
      const swapped = axisNodes.slice();
      [swapped[idx], swapped[nextIdx]] = [swapped[nextIdx], swapped[idx]];

      // renumber sequences 1..N based on new order
      const newSeqById = swapped.reduce((acc2, n, i) => {
        acc2[n.id] = i + 1;
        return acc2;
      }, {} as Record<string, number>);

      return prev.map((n) =>
        n.axisId === axisId ? { ...n, sequence: newSeqById[n.id] ?? n.sequence } : n
      );
    });
  };
    // --- Autosave (debounced) ---
  useLayoutEffect(() => {
    if (!autoSaveEnabled) return;
    if (!hasHydratedRef.current) return;

    // clear any pending save
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    // debounce so we don't save on every keystroke
    autosaveTimerRef.current = window.setTimeout(() => {
        saveCurrentSnapshot("autosave");

    }, 500);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveEnabled, title, subtitle, axes, rings, nodes]);


  const getAxisOrderInfo = (axisId: string, nodeId: string) => {
    const axisNodes = nodes
      .filter((n) => n.axisId === axisId)
      .slice()
      .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

    const idx = axisNodes.findIndex((n) => n.id === nodeId);
    return {
      idx,
      isFirst: idx <= 0,
      isLast: idx === axisNodes.length - 1,
    };
  };
const updateAxisLabel = (axisId: string, label: string) => {
  setAxes((prev) => prev.map((a) => (a.id === axisId ? { ...a, label } : a)));
};

const updateAxisNorthStar = (axisId: string, northStar: string) => {
  setAxes((prev) => prev.map((a) => (a.id === axisId ? { ...a, northStar } : a)));
};

const moveAxis = (axisId: string, direction: "up" | "down") => {
  setAxes((prev) => {
    const fromIndex = prev.findIndex((a) => a.id === axisId);
    if (fromIndex === -1) return prev;

    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= prev.length) return prev;

    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
};
const rotateAxesLeft = () => {
  setAxes((prev) => {
    if (prev.length <= 1) return prev;
    const [first, ...rest] = prev;
    return [...rest, first];
  });
};

const rotateAxesRight = () => {
  setAxes((prev) => {
    if (prev.length <= 1) return prev;
    const last = prev[prev.length - 1];
    return [last, ...prev.slice(0, prev.length - 1)];
  });
};

// Reset ALL nodes back to a “blank valuation” state
const resetNodes = () => {
  const ok = window.confirm(
    "Reset all nodes?\n\nThis will:\n- Set every node to Uncommitted\n- Clear all manual nudges\n- Clear all wrap formatting\n\nThis cannot be undone (unless you revert via a saved snapshot)."
  );
  if (!ok) return;

  setNodes((prev) =>
    prev.map((n) => ({
      ...n,
      ringId: "uncommitted",
      rOverride: null,
      wrapWidth: null,
    }))
  );

  setSelectedNodeId(null);
};



const addAxis = () => {

  const newAxisId = `axis-${uid()}`;

  setAxes((prev) => [
    ...prev,
    {
      id: newAxisId,
      label: "New axis",
      northStar: "New north star",
    },
  ]);
};

const addRing = () => {
  const newRingId = `ring-${uid()}`;

  setRings((prev) => [
    ...prev,
    {
      id: newRingId,
      label: "New ring",
    },
  ]);
};

  const commitInlineNodeEdit = () => {
    if (!editingNodeId) return;

    const next = editingNodeValue.trim();
    if (next.length > 0) {
      setNodes((prev) => prev.map((n) => (n.id === editingNodeId ? { ...n, label: next } : n)));
    }

    setEditingNodeId(null);
    setEditingNodeValue("");
    setEditingNodePos(null);
  };

  const cancelInlineNodeEdit = () => {
    setEditingNodeId(null);
    setEditingNodeValue("");
    setEditingNodePos(null);
  };

const deleteAxis = (axisId: string) => {

  const axis = axes.find((a) => a.id === axisId);
  const count = nodes.filter((n) => n.axisId === axisId).length;

  const ok = window.confirm(
    `Delete axis "${axis?.label ?? axisId}"?\n\nThis will also delete ${count} node(s) on this axis. This cannot be undone.`
  );
  if (!ok) return;

  // Compute next nodes FIRST (single source of truth)
  const nextNodes = nodes.filter((n) => n.axisId !== axisId);

  setAxes((prev) => prev.filter((a) => a.id !== axisId));
  setNodes(nextNodes);

  // selection safety — based on nextNodes, not stale nodes
  setSelectedNodeId((prev) =>
    prev && nextNodes.some((n) => n.id === prev) ? prev : null
  );
};


  return (
    <div className={`appShell ${leftCollapsed ? "noTopHeader" : ""}`}>
      {!leftCollapsed && (
  <header className="header">
    <strong>babyisland.dev</strong>
    <span className="muted">Workshop Tool v1</span>

    <button
      type="button"
      className="smallBtn"
      onClick={() => setGuidebookOpen(true)}
      style={{ marginLeft: 10 }}
      title="Open the Baby Island Guidebook"
    >
      Guidebook
    </button>

    <div style={{ marginLeft: "auto" }}>
      <button
        className="smallBtn"
        onClick={() => setLeftCollapsed((v) => !v)}
        title={leftCollapsed ? "Show the left panel" : "Collapse the left panel"}
      >
        {leftCollapsed ? "Build Mode" : "Presentation Mode"}
      </button>
    </div>
  </header>
)}

{guidebookOpen && (
  <div
    onClick={() => setGuidebookOpen(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      zIndex: 99999,
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: 24,
      overflowY: "auto",
    }}
  >
    <div
  onClick={(e) => e.stopPropagation()}
  style={{
  width: "min(900px, 100%)",
  background: "white",
  borderRadius: 16,
  padding: 18,
  marginTop: 20,
  fontFamily: '"Outfit", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',

  // 👇 these are the important parts
  fontWeight: 325,
  lineHeight: 1.6,
  letterSpacing: "0.1px",

  border: "1px solid rgba(0,0,0,0.08)",
}}

>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
  <div>
    <div style={{ fontWeight: 900, fontSize: 18 }}>
      Guidebook
    </div>
    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
      How to use Baby Island!
    </div>
  </div>

  <button className="smallBtn" onClick={() => setGuidebookOpen(false)}>
    Close
  </button>
</div>

<hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

<div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
  {/* Left: Table of contents */}
  <div style={{ flex: "0 0 240px" }}>
    <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
      Contents
    </div>

    <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
      <a href="#gb-1" style={{ textDecoration: "none" }}>1. Philosophy</a>
      <a href="#gb-2" style={{ textDecoration: "none" }}>2. Canonical structure</a>
      <a href="#gb-3" style={{ textDecoration: "none" }}>3. Rules</a>
      <a href="#gb-4" style={{ textDecoration: "none" }}>4. Law of simplicity</a>
      <a href="#gb-5" style={{ textDecoration: "none" }}>5. No child locks</a>
      <a href="#gb-6" style={{ textDecoration: "none" }}>6. Data model</a>
    </div>

  </div>

  {/* Right: Content */}
 <div
  style={{
    flex: "1 1 540px",
    minWidth: 280,
  }}
>
  <style>
    {`
      /* Force guidebook typography to be lighter + scan-friendly */
      .guidebookContent {
        font-family: "Outfit", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-weight: 325;
        line-height: 1.65;
        letter-spacing: 0.1px;
        color: #1f2d3d;
      }

      .guidebookContent p,
      .guidebookContent li {
        font-weight: 325;
      }

      .guidebookContent h2 {
        font-weight: 750;
        letter-spacing: -0.2px;
        margin: 6px 0 8px;
      }

      .guidebookContent h3 {
        font-weight: 650;
        letter-spacing: -0.1px;
        margin: 14px 0 6px;
      }

      .guidebookContent h4 {
        font-weight: 650;
        margin: 10px 0 6px;
      }
    `}
  </style>

  <div className="guidebookContent">
    {/* KEEP ALL YOUR EXISTING <section> CONTENT EXACTLY AS-IS BELOW THIS LINE */}

    <section id="gb-1" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>1. Philosophy</h2>

      <p>
        Baby Island is a visual strategy framework built on the idea that roadmaps should convey direction,
        maturity, and purpose without pretending to know the future with fake precision.
      </p>
      <p>
        It replaces timelines, swimlanes, and bloated roadmap decks with a radial, topographic metaphor that
        reflects how a product or organization grows capabilities over time.
      </p>
      <p>It is composed of four core elements, each serving a distinct purpose:</p>

      <h3 style={{ margin: "14px 0 6px" }}>1.1 North Star Statements (The &quot;Why&quot;)</h3>
      <p>
        The outer perimeter contains bold, qualitative statements of long-term excellence. These capture the
        aspirational outcomes a team or organization is driving toward. North Stars are intentionally durable —
        they should remain true across years, leadership changes, and market shifts.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>1.2 Strategic Axes (The &quot;How&quot;)</h3>
      <p>
        Radiating from the center, the axes represent the major pillars, capability ladders, or strategic dimensions
        required to achieve the North Stars. Each axis defines a path of progression toward a specific outer-rim
        aspiration, creating clear conceptual lanes for investment.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>1.3 Concentric Rings (The &quot;When / Maturity&quot;)</h3>
      <p>
        The rings represent horizons or maturity stages. They convey how capabilities evolve over time — from
        foundational to advanced. Rings do not map to precise dates; instead, they reflect readiness, sophistication,
        or impact. They show when a capability meaningfully contributes to the North Star, not when it ships.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>1.4 Nodes on Axes (The &quot;What&quot;)</h3>
      <p>
        Placed along each axis are nodes — the concrete features, initiatives, capabilities, or deliverables. Their
        placement shows:
      </p>
      <ul>
        <li>Which strategic pillar they ladder up to (axis)</li>
        <li>What level of maturity they belong in (ring)</li>
        <li>How they relate to other items on the same axis (sequence)</li>
      </ul>
      <p>
        Nodes are the actionable components of the strategy: the tangible investments that bring the future vision
        into reality.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>1.5 The Baby (The &quot;Where We Are Today&quot;)</h3>
      <p>
        At the center is a simple icon — the Baby. It is not the focal point of the framework; it is a symbol of the
        present state. It represents the idea that all strategies begin in infancy relative to the future goals defined
        on the perimeter. It marks the starting point from which growth radiates outward.
      </p>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-2" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>2. Canonical Structure</h2>

      <h3 style={{ margin: "14px 0 6px" }}>Outer Rim: North Star Statements (The &quot;Why&quot;)</h3>
      <ul>
        <li>Bold, qualitative aspirational statements on the perimeter.</li>
        <li>Provide directional pull for every axis.</li>
        <li>Represent durable definitions of long-term excellence.</li>
        <li>Examples: &quot;Frictionless Discovery&quot;, &quot;Ultra-Reliable Playback&quot;.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>Axes: Strategic Pillars / Capability Ladders (The &quot;How&quot;)</h3>
      <ul>
        <li>Typically 4–8 axes radiating outward.</li>
        <li>Each axis represents a major strategic dimension aligned to a North Star.</li>
        <li>Axes form the scaffolding of the strategy.</li>
        <li>Remain consistent over long periods.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>Rings: Time Horizons / Maturity Stages (The &quot;When / Maturity&quot;)</h3>
      <ul>
        <li>Usually 3–4 concentric rings.</li>
        <li>Represent maturity or horizons, not precise dates.</li>
        <li>Inner rings: foundations.</li>
        <li>Middle rings: expansions or integrations.</li>
        <li>Outer rings: advanced capabilities or long-bet areas.</li>
        <li>Convey when a capability becomes meaningful.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>Nodes: Capabilities / Initiatives (The &quot;What&quot;)</h3>
      <ul>
        <li>Placed along axes based on strategic pillar and maturity.</li>
        <li>Represent concrete work: features, capabilities, deliverables.</li>
        <li>Named simply and conceptually (e.g., &quot;Creator Tools&quot;, &quot;Identity Backbone&quot;).</li>
        <li>Sequence determines ordering when multiple nodes share an axis + ring.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>Center: The Baby (The &quot;Where We Are Today&quot;)</h3>
      <ul>
        <li>A symbolic icon representing the present state.</li>
        <li>Visual anchor reminding that strategy grows outward from today’s starting point.</li>
        <li>Not a focal element — a contextual one.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>Contours: Strategic Density &amp; Negative Space</h3>
      <ul>
        <li>Dense areas form the &quot;island mass&quot; of investment.</li>
        <li>Sparse areas reveal capability gaps or deprioritized pillars.</li>
        <li>The overall shape is the strategic signature people remember.</li>
      </ul>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-3" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>3. Rules</h2>
      <ol>
        <li>Avoid dates. Rings are maturity, not time.</li>
        <li>No features without purpose. Every node must ladder to a North Star.</li>
        <li>Axes change rarely. If you change them often, you don’t have a strategy.</li>
        <li>Clarity &gt; precision. Baby Island is about direction, not scheduling.</li>
        <li>Negative space matters. Gaps are as important as planned work.</li>
      </ol>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-4" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>4. The Law of Simplicity (&quot;&lt; = &gt;&quot;)</h2>

      <p>
        Baby Island is built on a communication philosophy: say the hard thing in the simplest way possible. This
        principle anchors the entire framework.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>4.1 Essence</h3>
      <p>
        A roadmap is only valuable if it is readable, interpretable, and memorable. Complexity destroys meaning.
        Baby Island forces the discipline of focus:
      </p>
      <ul>
        <li>If it can’t fit on one slide, it’s too much.</li>
        <li>The map reveals strategy through shape, not detail.</li>
        <li>Brevity is a feature, not a limitation.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>4.2 The Artist’s Constraint</h3>
      <p>
        “An artist says a hard thing in a simple way.” — Charles Bukowski
      </p>
      <p>
        Simplicity is not dumbing down. It’s mastery. The more complex the strategy, the more it demands
        compression into a clean, legible format.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>4.3 Practical Implications</h3>
      <ul>
        <li>Encourage short labels and conceptual names.</li>
        <li>Favor a small number of axes and rings.</li>
        <li>Limit the density of nodes through guidance (not restriction).</li>
        <li>Let negative space communicate priorities.</li>
      </ul>

      <p>Baby Island works because it respects human cognition and rewards clarity.</p>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-5" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>5. Tools for Adults: The No Child Locks Principle</h2>

      <p>
        Baby Island tools must respect the intelligence and autonomy of the people using them. Inspired by the No
        Child Locks philosophy, the Baby Island editor embraces guidance—not restriction.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>5.1 Adults, Not Toddlers</h3>
      <p>
        The users of this tool are strategists, operators, designers, and leaders. They deserve flexibility, not
        infantilizing limitations.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>5.2 Guardrails, Not Child Locks</h3>
      <ul>
        <li>Guardrails prevent breaking the metaphor (e.g., unreadable layouts).</li>
        <li>Child locks prevent capability out of fear (e.g., hard limits on nodes).</li>
      </ul>
      <p>Baby Island only uses guardrails. Never child locks.</p>

      <h3 style={{ margin: "14px 0 6px" }}>5.3 Nudge, Don’t Prevent</h3>
      <p>The tool will:</p>
      <ul>
        <li>Warn when an axis is overpopulated.</li>
        <li>Suggest clearer naming.</li>
        <li>Hint at reducing clutter.</li>
      </ul>
      <p>
        But it will never block a user from choosing complexity. The strategist is in control—not the tool.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>5.4 Flexibility Over Fear</h3>
      <p>The tool supports:</p>
      <ul>
        <li>Renaming axes</li>
        <li>Reconfiguring rings</li>
        <li>Adding advanced metadata</li>
        <li>Switching modes (Roadmap, OKR, Capability)</li>
        <li>Overriding defaults</li>
      </ul>
      <p>
        This honors the idea that restrictions based on today’s fears become tomorrow’s obstacles.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>5.5 Transparency and Shared Reality</h3>
      <p>The purpose of Baby Island is alignment, not enforcement. Its canvas is a way to expose:</p>
      <ul>
        <li>Gaps</li>
        <li>Imbalances</li>
        <li>Strategic weight</li>
        <li>Investment patterns</li>
      </ul>
      <p>It is a tool of clarity, not compliance.</p>

    
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-6" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>6. Data Model</h2>

      <p>
        To make Baby Island usable in a web app (instead of manual slide work), we treat the chart as data, not
        drawing.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>6.1 Core Entities</h3>

      <h4 style={{ margin: "10px 0 6px" }}>Axis</h4>
      <ul>
        <li><code>axis_id</code> (string)</li>
        <li><code>label</code> (e.g., &quot;Discovery&quot;, &quot;Reliability&quot;)</li>
        <li><code>north_star</code> (outer-rim statement for that axis)</li>
        <li><code>order_index</code> (position around the circle, e.g., 0–7)</li>
      </ul>

      <h4 style={{ margin: "10px 0 6px" }}>Ring (Horizon / Maturity Stage)</h4>
      <ul>
        <li><code>ring_id</code> (string)</li>
        <li><code>label</code> (e.g., &quot;Foundations&quot;, &quot;Acceleration&quot;, &quot;Moonshots&quot;)</li>
        <li><code>order_index</code> (0 = innermost, increasing outward)</li>
      </ul>

      <h4 style={{ margin: "10px 0 6px" }}>Node (Capability / Initiative)</h4>
      <ul>
        <li><code>node_id</code> (string)</li>
        <li><code>label</code> (feature / capability name)</li>
        <li><code>axis_id</code> (which pillar it ladders up)</li>
        <li><code>ring_id</code> (which maturity stage)</li>
        <li>
          <code>sequence</code> (integer to determine ordering of nodes along the same axis + ring)
        </li>
        <li>Optional metadata: <code>status</code>, <code>owner</code>, <code>confidence</code>, <code>notes</code>, etc.</li>
      </ul>

      <h3 style={{ margin: "14px 0 6px" }}>6.2 Simple Table Representation</h3>
      <p>For a basic UI, the data can be edited in a grid with columns such as:</p>
      <ul>
        <li>
          Axis / North Star (maps to <code>axis_id</code> + <code>north_star</code>)
        </li>
        <li>
          Feature / Capability Name (maps to <code>label</code>)
        </li>
        <li>
          Horizon (maps to <code>ring_id</code>, e.g., Now / Next / Later)
        </li>
        <li>
          Order (maps to <code>sequence</code>, controls placement when multiple nodes share an axis + ring)
        </li>
      </ul>
      <p>
        Under the hood, the app resolves these human-friendly values into the structured model above.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>6.3 Bidirectional Editing</h3>
      <ul>
        <li>
          Table → Chart: Editing a row updates the underlying node object, which updates the chart position
          (axis, ring, relative angle derived from sequence).
        </li>
        <li>
          Chart → Table: Dragging a node snaps it to the nearest axis + ring combo and updates that node’s
          <code> axis_id</code>, <code> ring_id</code>, and potentially <code>sequence</code>.
        </li>
      </ul>

      <p className="muted" style={{ marginTop: 12 }}>
        This separation (data model vs. rendering) is what makes the Baby Island format implementable as a
        reusable tool instead of a hand-crafted slide.
      </p>
    </section>
  </div>
</div>
</div>

    </div>
  </div>
)}


      <div className={`mainSplit ${leftCollapsed ? "mainSplitCollapsed" : ""}`}>
        <aside className="leftPanel">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

                    <label>
            Subtitle
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </label>

          {/* Left panel sections */}

  

  {/* --- Rings (must be above Axes & Nodes) --- */}
  <div
    style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
      marginTop: 12,
      marginBottom: 8,
    }}
  >
    <button
      type="button"
      className="smallBtn"
      onClick={() => setRingsOpen((v) => !v)}
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
      aria-expanded={ringsOpen}
    >
      <span style={{ fontWeight: 700 }}>Rings ({rings.length})</span>
      <span className="muted">{ringsOpen ? "▾" : "▸"}</span>
    </button>
  </div>

  {ringsOpen && (
    <>
      {rings.map((r) => (
        <input
          key={r.id}
          value={r.label}
          onChange={(e) =>
            setRings((prev) =>
              prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x))
            )
          }
        />
      ))}
    </>
  )}

  {/* --- Axes & Nodes (must be above Admin) --- */}
  <div
    style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
      marginTop: 12,
      marginBottom: 8,
    }}
  >
    <button
      type="button"
      className="smallBtn"
      onClick={() =>
  setNodesOpen((v) => {
    const next = !v;
    if (!next) setExpandedAxisIds({}); // collapsing parent collapses all children
    return next;
  })
}

      style={{
        flex: 1,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
      aria-expanded={nodesOpen}
    >
      <span style={{ fontWeight: 700 }}>
        Axes & Nodes ({axes.length} / {nodes.length})
      </span>
      <span className="muted">{nodesOpen ? "▾" : "▸"}</span>
    </button>

    <button
      type="button"
      className="smallBtn"
      onClick={() => {
        setNodesOpen(true);
        addAxis();
      }}
      title="Add a new axis"
      style={{ whiteSpace: "nowrap" }}
    >
      + Axis
    </button>
  </div>

  {nodesOpen && (
    <>
      <div className="muted" style={{ marginBottom: 8 }}>
        Nodes loaded: {nodes.length}
      </div>

      <div className="nodeGroups">
        {axes.map((axis) => {
          const axisNodeCount = nodes.filter((n) => n.axisId === axis.id).length;

          return (
            <div key={axis.id} className="nodeAxisGroup">
              <div className="nodeAxisHeader">
                <div className="axisHeaderMain">
                  {axisWarnings[axis.id]?.length ? (
                    <div className="axisWarning">
                      <div className="axisWarningTitle">Whoa buddy!</div>
                      <ul className="axisWarningList">
                        {axisWarnings[axis.id].map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <input
                    className="nodeAxisTitleInput"
                    value={axis.label}
                    onChange={(e) => updateAxisLabel(axis.id, e.target.value)}
                    placeholder="Axis name"
                    onClick={(e) => e.stopPropagation()}
                  />

                  <div className="nodeAxisNorthStarWrap">
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      North Star
                    </div>

                    <textarea
                      className="nodeAxisNorthStarInput"
                      value={axis.northStar}
                      onChange={(e) => updateAxisNorthStar(axis.id, e.target.value)}
                      placeholder="What does success mean for this axis?"
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="axisMetaRow">
                    <div className="muted" style={{ fontSize: 12 }}>
                      {axisNodeCount} node(s)
                    </div>

                    <button
                      type="button"
                      className="axisExpandBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAxisExpanded(axis.id);
                      }}
                      title={isAxisExpanded(axis.id) ? "Collapse nodes" : "Expand nodes"}
                      aria-label={isAxisExpanded(axis.id) ? "Collapse nodes" : "Expand nodes"}
                    >
                      {isAxisExpanded(axis.id) ? "−" : "+"}
                    </button>
                  </div>
                </div>

                <div className="axisHeaderControls">
                  <div className="axisMoveBtns">
                    <button
                      type="button"
                      className="axisMoveBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveAxis(axis.id, "up");
                      }}
                      disabled={axes.findIndex((a) => a.id === axis.id) === 0}
                      title="Move axis up"
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      className="axisMoveBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveAxis(axis.id, "down");
                      }}
                      disabled={axes.findIndex((a) => a.id === axis.id) === axes.length - 1}
                      title="Move axis down"
                    >
                      ↓
                    </button>
                  </div>

                  <button
                    className="smallBtn"
                    onClick={() => {
                      expandAxis(axis.id);

                      const axisNodesOrdered = nodes
                        .filter((n) => n.axisId === axis.id)
                        .slice()
                        .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

                      const defaultRingId = "uncommitted";


                      const maxSeq = axisNodesOrdered.reduce((m, n) => Math.max(m, n.sequence), 0);
                      const newId = uid();

                      setNodes((prev) => [
                        ...prev,
{
  id: newId,
  label: "New node",
  axisId: axis.id,
  ringId: defaultRingId,
  sequence: maxSeq + 1,
  wrapWidth: null,
},

                      ]);

                      setSelectedNodeId(newId);

                    
                    }}
                    title="Add a node to this axis (defaults to the axis’s current ring + ordering)"
                  >
                    + Add node
                  </button>

                  <button
                    type="button"
                    className="dangerBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAxis(axis.id);
                    }}
                    title="Delete this axis (also deletes its nodes)"
                  >
                    Delete axis
                  </button>
                </div>
              </div>

              {isAxisExpanded(axis.id) &&
                rings.map((r) => {
                  const ringNodes = nodes
                    .filter((n) => n.axisId === axis.id && n.ringId === r.id)
                    .slice()
                    .sort((a, b) => a.sequence - b.sequence);

                  return (
                    <div key={r.id} className="nodeRingGroup">
                      <div className="nodeRingHeader">{r.label}</div>

                      {ringNodes.length === 0 ? (
                        <div className="muted" style={{ fontSize: 12, padding: "6px 0 2px" }}>
                          —
                        </div>
                      ) : (
                        <div className="nodeList">
                          {ringNodes.map((n) => {
                            const orderInfo = getAxisOrderInfo(n.axisId, n.id);

                            return (
                              <div
                                key={n.id}
                                className={`nodeRow ${selectedNodeId === n.id ? "nodeRowSelected" : ""}`}
                                ref={(el) => {
                                  nodeRowRefs.current[n.id] = el;
                                }}
                                onClick={() => setSelectedNodeId(n.id)}
                                style={{ cursor: "pointer" }}
                              >
                                <div className="nodeMeta">
                                  <div className="nodeLabel">Node</div>
                                  <input
  value={n.label}
  onChange={(e) =>
    setNodes((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, label: e.target.value } : x
      )
    )
  }
/>

                                </div>

<div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
  <label className="viewToggle" style={{ margin: 0 }}>
    <input
      type="checkbox"
      checked={!!n.wrapWidth}
      onChange={(e) => {
        const on = e.target.checked;
        setNodes((prev) =>
          prev.map((x) =>
            x.id === n.id
              ? { ...x, wrapWidth: on ? DEFAULT_NODE_WRAP_WIDTH : null }
              : x
          )
        );
      }}
    />
    <span>Wrap</span>
  </label>

  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>W</span>
  <input
    type="text"
    inputMode="numeric"
    pattern="[0-9]*"
    value={n.wrapWidth ? String(n.wrapWidth) : ""}
    placeholder="px"
    onChange={(e) => {
      const v = e.target.value.replace(/\D/g, "");
      const num = v === "" ? null : Math.max(60, Math.min(360, parseInt(v, 10)));
      setNodes((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, wrapWidth: num } : x))
      );
    }}
    style={{ width: 58, padding: "6px 8px" }}
    title="Wrap width (px)"
  />
</div>


                                <div className="nodeControls">
                                  <div className="nodeControl">
                                    <div className="nodeLabel">Ring</div>
                                    <select
                                      value={n.ringId}
                                      onChange={(e) =>
                                        setNodes((prev) =>
                                          prev.map((x) =>
                                            x.id === n.id ? { ...x, ringId: e.target.value } : x
                                          )
                                        )
                                      }
                                    >
                                      {rings.map((rr) => (
                                        <option key={rr.id} value={rr.id}>
                                          {rr.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="nodeControl" style={{ maxWidth: 120 }}>
                                    <div className="nodeLabel">Order</div>

                                    <div className="orderRow">
                                      <button
                                        className="orderBtn"
                                        disabled={orderInfo.isFirst}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveNodeInAxis(n.axisId, n.id, -1);
                                        }}
                                        title={orderInfo.isFirst ? "Already first" : "Move up"}
                                      >
                                        ↑
                                      </button>

                                      <div className="orderIndex">{n.sequence}</div>

                                      <button
                                        className="orderBtn"
                                        disabled={orderInfo.isLast}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveNodeInAxis(n.axisId, n.id, +1);
                                        }}
                                        title={orderInfo.isLast ? "Already last" : "Move down"}
                                      >
                                        ↓
                                      </button>
                                    </div>
                                  </div>

                                  <button
                                    className="dangerBtn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setNodes((prev) => prev.filter((x) => x.id !== n.id));
                                    }}
                                    title="Delete node"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </>
  )}

  {/* --- Admin (bottom) --- */}
  <div
    style={{
      width: "100%",
      border: "1px solid rgba(0,0,0,0.08)",
      borderRadius: 12,
      padding: 10,
      background: "rgba(0,0,0,0.02)",
      marginTop: 14,
    }}
  >
    <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
      Admin
    </div>

    {/* Strategy dropdown + name + copy link */}
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        width: "100%",
        flexWrap: "wrap",
      }}
    >
      <select
        value={activeSnapshotId ?? ""}
        onChange={(e) => loadSnapshotById(e.target.value)}
        style={{ minWidth: 180, flex: "1 1 240px" }}
        title="Select a saved strategy"
      >
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {activeSnapshotId && (
        <input
          value={snapshots.find((s) => s.id === activeSnapshotId)?.name ?? ""}
          onChange={(e) => renameSnapshot(activeSnapshotId, e.target.value)}
          style={{ width: 180, flex: "0 1 auto" }}
          title="Rename current strategy"
        />
      )}
<span
  onClick={copyStrategyLink}
  title="Copy link to this strategy"
  style={{
    cursor: "pointer",
    fontSize: 18,
    marginLeft: 6,
    opacity: 0.7,
    userSelect: "none",
  }}
>
  {copiedAt ? "✓" : "🔗"}
</span>
<div
  style={{
    display: "flex",
    gap: 8,
    marginTop: 6,
    width: "100%",
    flexWrap: "wrap",
  }}
>
  <button
    className="smallBtn"
    onClick={rotateAxesLeft}
    title="Rotate all axes counter-clockwise"
  >
    ↺ Rotate
  </button>

  <button
    className="smallBtn"
    onClick={rotateAxesRight}
    title="Rotate all axes clockwise"
  >
    ↻ Rotate
  </button>

  <button
    className="smallBtn"
    onClick={resetNodes}
    title="Reset all nodes back to Uncommitted + clear nudges/wraps"
  >
    🧹 Reset nodes
  </button>
</div>


    </div>
{/* Quick Start */}
<div
  style={{
    marginTop: 10,
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  }}
>
  <button
  type="button"
  className="smallBtn"
  onClick={() => {
    const ok = window.confirm(
      `Replace current axes/nodes?\n\nCreate ${qsAxes} axes with ${qsNodesPerAxis} node(s) each?`
    );
    if (!ok) return;
    quickStart();
  }}
  title="Create a starter set of axes + nodes in one click"
  style={{ whiteSpace: "nowrap" }}
>
  ⚡ Quick start
</button>

<span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
  Axes
</span>
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  value={qsAxes}
  onChange={(e) => {
    const v = e.target.value.replace(/\D/g, "");
    const n = v === "" ? 0 : parseInt(v, 10);
    setQsAxes(Math.max(1, Math.min(16, n)));
  }}
  style={{
    width: 34,
    padding: "6px 6px",
    textAlign: "center",
    MozAppearance: "textfield",
  }}
  title="Number of axes"
/>

<span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
  Nodes
</span>
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  value={qsNodesPerAxis}
  onChange={(e) => {
    const v = e.target.value.replace(/\D/g, "");
    const n = v === "" ? 0 : parseInt(v, 10);
    setQsNodesPerAxis(Math.max(0, Math.min(20, n)));
  }}
  style={{
    width: 34,
    padding: "6px 6px",
    textAlign: "center",
    MozAppearance: "textfield",
  }}
  title="Nodes per axis"
/>

</div>

     

    {/* Action buttons */}
    <div style={{ marginTop: 10, width: "100%" }}>
      {/* Row 1: Save / Save As / Dupe / New */}
      <div
        style={{
          display: "flex",
          gap: 8,
          width: "100%",
          flexWrap: "wrap",
        }}
      >
        <button
          className="smallBtn"
          onClick={() => saveCurrentSnapshot("manual")}
          title="Save current strategy"
          disabled={!activeSnapshotId}
        >
          Save
        </button>

        <button
          className="smallBtn"
          onClick={() => {
            const name = window.prompt("Name this strategy:", "New Strategy");
            if (!name) return;
            createSnapshot(name, true);
          }}
          title="Save as a new named strategy"
        >
          Save As
        </button>

        <button
          className="smallBtn"
          onClick={() => {
            if (!activeSnapshotId) return;
            duplicateSnapshot(activeSnapshotId);
          }}
          title="Duplicate current strategy"
          disabled={!activeSnapshotId}
        >
          Dupe
        </button>

        <button
          className="smallBtn"
          onClick={() => {
            const name = window.prompt("Name new strategy:", "Untitled Strategy");
            if (!name) return;

            // wipe to blank first
            resetWorkingStateBlank();

            // then snapshot the blank state
            requestAnimationFrame(() => {
              const blank: BabyIslandSavedStateV1 = {
                v: 1,
                savedAt: Date.now(),
                title: "Untitled Strategy",
                subtitle: "",
                axes: BLANK_AXES,
                rings: DEFAULT_RINGS,
                nodes: BLANK_NODES,
              };

              createSnapshot(name, true, blank);
            });
          }}
          title="Start a brand new blank strategy"
        >
          New
        </button>
      </div>

      {/* Row 2: Export / Import / Delete */}
      <div
        style={{
          display: "flex",
          gap: 8,
          width: "100%",
          flexWrap: "wrap",
          marginTop: 8,
        }}
      >
        <div style={{ position: "relative" }}>
          <button
            className="smallBtn"
            onClick={(e) => {
              e.stopPropagation();
              setExportMenuOpen((v) => !v);
            }}
            title="Export this strategy"
            disabled={!activeSnapshotId}
          >
            Export ▾
          </button>

          {exportMenuOpen && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 9999,
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                padding: 8,
                minWidth: 180,
                display: "grid",
                gap: 6,
              }}
            >
              <button className="smallBtn" onClick={() => onExportPick("json")} title="Export JSON data file">
                JSON (data file)
              </button>
              <button className="smallBtn" onClick={() => onExportPick("png")} title="Export a high-res PNG of the chart">
                PNG (image)
              </button>
              <button className="smallBtn" onClick={() => onExportPick("csv")} title="Export a CSV of axes + nodes">
                CSV (table)
              </button>
            </div>
          )}
        </div>


        {/* hidden file input */}
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,.babyisland.json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            importStrategyFromFile(f);
          }}
        />

        <button
          className="smallBtn"
          onClick={() => importFileInputRef.current?.click()}
          title="Import a previously exported Baby Island data file (JSON)"
        >
          Import
        </button>

        <button
          className="dangerBtn"
          onClick={() => {
            if (!activeSnapshotId) return;
            const current = snapshots.find((s) => s.id === activeSnapshotId);
            const ok = window.confirm(
              `Delete strategy "${current?.name ?? "this strategy"}"? This cannot be undone.`
            );
            if (!ok) return;
            deleteSnapshot(activeSnapshotId);
          }}
          title="Delete current strategy"
          disabled={!activeSnapshotId}
        >
          Delete
        </button>
      </div>
    </div>


    {/* Autosave + Saved timestamp */}
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
      <label className="viewToggle">
        <input
          type="checkbox"
          checked={autoSaveEnabled}
          onChange={(e) => {
            const next = e.target.checked;
            setAutoSaveEnabled(next);
            try {
              localStorage.setItem(AUTOSAVE_KEY, next ? "1" : "0");
            } catch {}
            if (next) saveCurrentSnapshot("autosave");
          }}
        />
        <span>Autosave</span>
      </label>

      <span className="muted" style={{ fontSize: 12 }}>
        {lastSavedAt
          ? `Saved ✓ ${new Date(lastSavedAt).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}`
          : "Not saved yet"}
      </span>
    </div>
  </div>
</aside>

        <main className="rightPanel">
  <div
    className={`canvasPlaceholder ${leftCollapsed ? "canvasPlaceholderCollapsed" : ""}`}
    style={{ position: "relative" }}
  >
    {/* LEFT COLUMN (only used in collapsed mode) */}
    {leftCollapsed && (
      <div className="collapsedControlsCol">
        <div className="collapsedTopRow">
          <button
            className="smallBtn"
            onClick={() => setLeftCollapsed(false)}
            title="Show the left panel"
          >
            Build mode
          </button>

          
        </div>

        <div className="canvasHeader canvasHeaderCollapsed">
          <div>
            <div className="title">{title}</div>
            <div className="subtitle">{subtitle}</div>

            {/* Controls (compact, in-flow) */}
            <div
  className="viewBar"
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 10,
  }}
>


                  {(() => {
                    const allOn = showNowBlob && showNextBlob && showLaterBlob;

                    const nowLabel = rings.find((r) => r.id === "now")?.label ?? "Now";
                    const nextLabel = rings.find((r) => r.id === "next")?.label ?? "Next";
                    const laterLabel = rings.find((r) => r.id === "later")?.label ?? "Later";

                    return (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          style={ringMasterBtnStyle(allOn)}
                          onClick={() => {
                            const next = !allOn;
                            setShowNowBlob(next);
                            setShowNextBlob(next);
                            setShowLaterBlob(next);
                          }}
                          title="Toggle all rings"
                        >
                          Rings
                        </button>

                        <button
                          type="button"
                          style={ringToggleBtnStyle(showNowBlob, RING_COLORS.now)}
                          onClick={() => {
                            const next = !showNowBlob;
                            setShowNowBlob(next);
                            if (!next) {
                              // If Now turns off, Next/Later can't remain on (cumulative)
                              setShowNextBlob(false);
                              setShowLaterBlob(false);
                            }
                          }}
                          title="Toggle Now ring"
                        >
                          {nowLabel}
                        </button>

                        <button
                          type="button"
                          style={ringToggleBtnStyle(showNextBlob, RING_COLORS.next)}
                          onClick={() => {
                            const next = !showNextBlob;
                            setShowNextBlob(next);
                            if (next) {
                              setShowNowBlob(true);
                            } else {
                              setShowLaterBlob(false);
                            }
                          }}
                          title="Toggle Next ring"
                        >
                          {nextLabel}
                        </button>

                        <button
                          type="button"
                          style={ringToggleBtnStyle(showLaterBlob, RING_COLORS.later)}
                          onClick={() => {
                            const next = !showLaterBlob;
                            setShowLaterBlob(next);
                            if (next) {
                              setShowNextBlob(true);
                              setShowNowBlob(true);
                            }
                          }}
                          title="Toggle Later ring"
                        >
                          {laterLabel}
                        </button>
                      </div>
                    );
                  })()}

                  {/* spacer removed in collapsed mode */}


                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={ringMasterBtnStyle(showNodeLabels)}
                      onClick={() => setShowNodeLabels((v) => !v)}
                      title="Toggle labels"
                    >
                      Labels
                    </button>

                    <button
                      type="button"
                      style={ringMasterBtnStyle(showNodes)}
                      onClick={() => setShowNodes((v) => !v)}
                      title="Toggle nodes"
                    >
                      Nodes
                    </button>
                  </div>



                            </div>
          </div>
        </div>
      </div>
    )}

    {/* RIGHT PANEL HEADER (only when NOT collapsed) */}
    {!leftCollapsed && (
      <div className="canvasHeader">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div className="title">{title}</div>
          <div className="subtitle">{subtitle}</div>

          {/* Controls row (under subtitle, left-aligned) */}
          <div
            className="viewBar"
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            {(() => {
              const allOn = showNowBlob && showNextBlob && showLaterBlob;

              const nowLabel = rings.find((r) => r.id === "now")?.label ?? "Now";
              const nextLabel = rings.find((r) => r.id === "next")?.label ?? "Next";
              const laterLabel = rings.find((r) => r.id === "later")?.label ?? "Later";

              return (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    style={ringMasterBtnStyle(allOn)}
                    onClick={() => {
                      const next = !allOn;
                      setShowNowBlob(next);
                      setShowNextBlob(next);
                      setShowLaterBlob(next);
                    }}
                    title="Toggle all rings"
                  >
                    Rings
                  </button>

                  <button
                    type="button"
                    style={ringToggleBtnStyle(showNowBlob, RING_COLORS.now)}
                    onClick={() => {
                      const next = !showNowBlob;
                      setShowNowBlob(next);
                      if (!next) {
                        setShowNextBlob(false);
                        setShowLaterBlob(false);
                      }
                    }}
                    title="Toggle Now ring"
                  >
                    {nowLabel}
                  </button>

                  <button
                    type="button"
                    style={ringToggleBtnStyle(showNextBlob, RING_COLORS.next)}
                    onClick={() => {
                      const next = !showNextBlob;
                      setShowNextBlob(next);
                      if (next) {
                        setShowNowBlob(true);
                      } else {
                        setShowLaterBlob(false);
                      }
                    }}
                    title="Toggle Next ring"
                  >
                    {nextLabel}
                  </button>

                  <button
                    type="button"
                    style={ringToggleBtnStyle(showLaterBlob, RING_COLORS.later)}
                    onClick={() => {
                      const next = !showLaterBlob;
                      setShowLaterBlob(next);
                      if (next) {
                        setShowNextBlob(true);
                        setShowNowBlob(true);
                      }
                    }}
                    title="Toggle Later ring"
                  >
                    {laterLabel}
                  </button>

                  <span style={{ width: 6 }} />
                </div>
              );
            })()}


                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                style={ringMasterBtnStyle(showNodeLabels)}
                onClick={() => setShowNodeLabels((v) => !v)}
                title="Toggle labels"
              >
                Labels
              </button>

              <button
                type="button"
                style={ringMasterBtnStyle(showNodes)}
                onClick={() => setShowNodes((v) => !v)}
                title="Toggle nodes"
              >
                Nodes
              </button>
            </div>

          </div>
        </div>
      </div>
    )}


    {/* CANVAS COLUMN (always present) */}
    <div className="canvasStageCol">

      {(() => {

              const { ref: measuredRef, size } = useSize<HTMLDivElement>();

              // combine refs: we need the div measured AND stageRef for tooltip positioning
              const setStageEl = (el: HTMLDivElement | null) => {
                stageRef.current = el;
                (measuredRef as any).current = el;
              };

              const w = size.width > 0 ? size.width : 1000;
              const h = size.height > 0 ? size.height : 800;

              const padding = 56; // tweak this to taste
              const cx2 = w / 2;
              const cy2 = h / 2;

              const outerR2 = Math.max(1, Math.min(w, h) / 2 - padding);
              const ringNow = outerR2 * 0.4;
              const ringNext = outerR2 * 0.7;
              const ringLater = outerR2;
              // Special-case: when there are 4 or 8 axes, rotate by 45° so labels don’t collide with horizontal axis lines
const axisAngleOffset =
  axes.length === 4 ? Math.PI / 4 :
  axes.length === 8 ? Math.PI / 8 :
  0;



              // -------------------- Drag helpers (inside SVG sizing scope) --------------------
const ringRadiusByIdBase: Record<string, number> = {
  now: ringNow,
  next: ringNext,
  later: ringLater,
};

const DRAG_MAX_R = ringLater - 10; // keep inside outer circle

function clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = stageRef.current?.getBoundingClientRect();
  if (!rect) return { x: cx2, y: cy2 };

  const nx = (clientX - rect.left) / rect.width;  // 0..1
  const ny = (clientY - rect.top) / rect.height;  // 0..1

  return {
    x: nx * w,
    y: ny * h,
  };
}

function clampPointToOuterCircle(p: { x: number; y: number }) {
  const dx = p.x - cx2;
  const dy = p.y - cy2;
  const r = Math.hypot(dx, dy);
  if (r <= DRAG_MAX_R || r === 0) return p;

  const k = DRAG_MAX_R / r;
  return { x: cx2 + dx * k, y: cy2 + dy * k };
}

function normalizeAngle(rad: number) {
  const twoPi = Math.PI * 2;
  let a = rad % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

function circularAngleDiff(a: number, b: number) {
  const twoPi = Math.PI * 2;
  const d = Math.abs(a - b) % twoPi;
  return d > Math.PI ? twoPi - d : d;
}

function snapAxisIdFromPoint(x: number, y: number): string {
  if (axes.length === 0) return "";

  const dropA = normalizeAngle(Math.atan2(y - cy2, x - cx2));

  let bestAxisId = axes[0].id;
  let best = Number.POSITIVE_INFINITY;

  for (let i = 0; i < axes.length; i++) {
    const ax = axes[i];
    const axA = normalizeAngle(axisAngleOffset + (-Math.PI / 2 + (i * 2 * Math.PI) / axes.length));
    const d = circularAngleDiff(dropA, axA);
    if (d < best) {
      best = d;
      bestAxisId = ax.id;
    }
  }

  return bestAxisId;
}

// Mirror your "last committed dot" logic enough to compute uncommittedMidR eligibility
function computeCommittedMaxRawRForAxis(axisId: string) {
  const spread = 18;

  const axisNodes = nodes
    .filter((n) => n.axisId === axisId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

  const nodesByRing = rings.reduce((acc2, r) => {
    acc2[r.id] = axisNodes.filter((n) => n.ringId === r.id);
    return acc2;
  }, {} as Record<string, NodeItem[]>);

// For snap logic, we want the “last committed before the outer band”
// when uncommitted exists, that means Now/Next only (exclude Later)
const hasUncommitted = axisNodes.some((n) => n.ringId === "uncommitted");

const committed = axisNodes.filter((n) =>
  hasUncommitted ? (n.ringId !== "uncommitted" && n.ringId !== "later") : (n.ringId !== "uncommitted")
);

if (committed.length === 0) return 0;

return Math.max(
  ...committed.map((cn) => {

      const base = ringRadiusByIdBase[cn.ringId] ?? ringLater;

      const ringList = nodesByRing[cn.ringId] ?? [];
      const idx = ringList.findIndex((x) => x.id === cn.id);
      const k = ringList.length;

      const offset = k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread;
      return base + offset;
    })
  );
}

function snapRingIdFromRadius(axisId: string, dropR: number): string {
  // Base nearest ring among now/next/later
  const candidates = [
    { id: "now", r: ringNow },
    { id: "next", r: ringNext },
    { id: "later", r: ringLater },
  ];

  let best = candidates[0].id;
  let bestD = Math.abs(dropR - candidates[0].r);

  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(dropR - candidates[i].r);
    if (d < bestD) {
      bestD = d;
      best = candidates[i].id;
    }
  }

  // Uncommitted is only a valid snap target if drop is in the OUTER HALF
  // between committedMaxRawR and ringLater.
  const committedMaxRawR = computeCommittedMaxRawRForAxis(axisId);
  const uncommittedMidR = committedMaxRawR === 0 ? ringLater / 2 : (committedMaxRawR + ringLater) / 2;

  const outerHalfStart = uncommittedMidR;
  if (dropR >= outerHalfStart) return "uncommitted";

  return best;
}

function pointerMoveDrag(e: React.PointerEvent<SVGSVGElement>) {
  if (activePointerIdRef.current == null) return;
  if (e.pointerId !== activePointerIdRef.current) return;
  if (!draggingNodeId) return;

  // Determine if we’ve crossed the drag threshold (to prevent click spam)
  const start = dragStartClientRef.current;
  if (start) {
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!didDragRef.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
      didDragRef.current = true;
    }
  }

  // Only show "drag follow" once it’s a real drag
  if (!didDragRef.current) return;

  const p = clientToSvgPoint(e.clientX, e.clientY);
  const clamped = clampPointToOuterCircle(p);
  setDragPos(clamped);
}

function pointerEndDrag(e: React.PointerEvent<SVGSVGElement>) {
  if (activePointerIdRef.current == null) return;
  if (e.pointerId !== activePointerIdRef.current) return;

  const nodeId = draggingNodeId;
  const dragged = didDragRef.current;

  // Reset pointer tracking first (avoid weird re-entrancy)
  activePointerIdRef.current = null;
  dragStartClientRef.current = null;
  setDraggingNodeId(null);

  const finalPos = dragPos;
  setDragPos(null);

  // If it was just a click (no movement), do your normal click behavior (scroll only).
  // Selection is handled in onPointerDown (and can toggle off), so we must NOT re-select here.
  if (!nodeId) return;
  if (!dragged) {
    const n = nodes.find((x) => x.id === nodeId);
    if (n) {
      // Only expand + scroll if the node is still selected
      // (prevents expanding/scrolling when user is deselecting)
      if (selectedNodeId === n.id) {
        expandAxis(n.axisId);
        const el = nodeRowRefs.current[n.id];
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    didDragRef.current = false;
    return;
  }


  // If it was a drag, snap + update node (no click scroll spam)
  if (!finalPos) {
    didDragRef.current = false;
    return;
  }

  const dx = finalPos.x - cx2;
  const dy = finalPos.y - cy2;
  const dropR = Math.min(Math.hypot(dx, dy), DRAG_MAX_R);

  const nextAxisId = snapAxisIdFromPoint(finalPos.x, finalPos.y);
  const nextRingId = snapRingIdFromRadius(nextAxisId, dropR);

  setNodes((prev) => {
  const moving = prev.find((x) => x.id === nodeId);
  if (!moving) return prev;

  const axisChanged = moving.axisId !== nextAxisId;
  const ringChanged = moving.ringId !== nextRingId;

  // If you stay on same axis+ring, store manual radial position.
  // If you change axis or ring, clear it.
  const nextOverride =
    axisChanged || ringChanged ? null : dropR / ringLater; // normalized 0..1 of ringLater

  // Minimal sequence logic:
  // - If staying in same axis+ring, keep sequence.
  // - If moving axis or ring, append to end of that axis+ring.
  let nextSeq = moving.sequence;
  if (axisChanged || ringChanged) {
    const maxSeq = prev
      .filter((x) => x.axisId === nextAxisId && x.ringId === nextRingId)
      .reduce((m, x) => Math.max(m, x.sequence), 0);
    nextSeq = maxSeq + 1;
  }

  return prev.map((x) =>
    x.id === nodeId
      ? {
          ...x,
          axisId: nextAxisId,
          ringId: nextRingId,
          sequence: nextSeq,
          rOverride: nextOverride,
        }
      : x
  );
});


  // Selection should follow the dragged node (but don’t scroll)
  expandAxis(nextAxisId);
  setSelectedNodeId(nodeId);

  didDragRef.current = false;
}



              const svgPointToClient = (x: number, y: number) => {
                const rect = stageRef.current?.getBoundingClientRect();
                if (!rect) return { left: 0, top: 0 };

                // x,y are in SVG viewBox space; map into the displayed DOM size
                const left = (x / w) * rect.width;
                const top = (y / h) * rect.height;

                return { left, top };
              };

              const startInlineNodeEdit = (nodeId: string, currentLabel: string, x: number, y: number) => {
                const p = svgPointToClient(x, y);
                setEditingNodeId(nodeId);
                setEditingNodeValue(currentLabel);
                setEditingNodePos({ left: p.left, top: p.top });

                // focus next tick after it renders
                requestAnimationFrame(() => {
                  editNodeInputRef.current?.focus();
                  editNodeInputRef.current?.select();
                });
              };

              return (
                <div className="svgStage" ref={setStageEl}>

                    <svg
  ref={svgExportRef}
  style={{ fontFamily: '"Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}
  width="100%"
  height="100%"
  viewBox={`0 0 ${w} ${h}`}
  preserveAspectRatio="xMidYMid meet"
  onPointerMove={(e) => {
  // node dragging (existing)
  pointerMoveDrag(e);

  // wrap handle resizing (new)
  if (!resizingWrapNodeId) return;
  const start = wrapResizeStartRef.current;
  if (!start) return;

  const dx = e.clientX - start.x;
  const nextW = Math.max(60, Math.min(360, Math.round(start.w + dx)));

  setNodes((prev) =>
    prev.map((x) =>
      x.id === resizingWrapNodeId ? { ...x, wrapWidth: nextW } : x
    )
  );
}}
onPointerUp={(e) => {
  // end node drag (existing)
  pointerEndDrag(e);

  // end wrap resize (new)
  if (resizingWrapNodeId) {
    setResizingWrapNodeId(null);
    wrapResizeStartRef.current = null;
  }
}}
onPointerCancel={(e) => {
  pointerEndDrag(e);
  setResizingWrapNodeId(null);
  wrapResizeStartRef.current = null;
}}

>


 <style>
  {`
    text, tspan {
      font-family: "Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
    }
  `}
</style>



 <defs>
  <radialGradient id="oceanGrad" cx="50%" cy="50%" r="75%" gradientUnits="userSpaceOnUse">
  <stop offset="0%"  stopColor="#e9fbff" />
  <stop offset="60%" stopColor="#d6f4ff" />
  <stop offset="100%" stopColor="#c2eaff" />

  {/* slow, subtle "breathing" ripple */}
 <animate
  attributeName="r"
  values="350;430;350"
  dur="3s"
  repeatCount="indefinite"
/>


</radialGradient>


  {/* Clip so water only appears inside island boundary */}
  <clipPath id="oceanClip">
    <circle cx={cx2} cy={cy2} r={ringLater} />
  </clipPath>
</defs>


  <g>
 {/* Ocean background */}
<rect
  x="0"
  y="0"
  width={w}
  height={h}
  fill="url(#oceanGrad)"
  clipPath="url(#oceanClip)"
/>





{/* --- Blobs (animated): cumulative per ring, tied to furthest DOT per axis --- */}
{(showNowBlob || showNextBlob || showLaterBlob) ? (
  <BlobLayer
    axes={axes}
    rings={rings}
    nodes={nodes}
    cx2={cx2}
    cy2={cy2}
    ringNow={ringNow}
    ringNext={ringNext}
    ringLater={ringLater}
    showNowBlob={showNowBlob}
    showNextBlob={showNextBlob}
    showLaterBlob={showLaterBlob}
  />
) : null}




                                    {/* Rings (outer border only) */}
                      <circle cx={cx2} cy={cy2} r={ringLater} fill="none" stroke="#ddd" />


                      {/* Axes + labels */}
                      {axes.map((a, i) => {
                        const n = axes.length;
                        const angle = axisAngleOffset + (-Math.PI / 2 + (i * 2 * Math.PI) / n);


                        const x2 = cx2 + outerR2 * Math.cos(angle);
                        const y2 = cy2 + outerR2 * Math.sin(angle);

                        const labelR2 = outerR2 + 22;
                        const lx = cx2 + labelR2 * Math.cos(angle);
                        const ly = cy2 + labelR2 * Math.sin(angle);

                        const isRight = lx >= cx2;
                        const anchor: "start" | "end" = isRight ? "start" : "end";
                        const dx = isRight ? 10 : -10;

                        return (
                          <g key={a.id}>
                            <line x1={cx2} y1={cy2} x2={x2} y2={y2} stroke="rgba(0,0,0,0.45)" strokeWidth={2} />

                            <text
                              x={lx + dx}
                              y={ly}
                              textAnchor={anchor}
                              dominantBaseline="middle"
                              fontSize="18"
                              fill="#333"
                              style={{ cursor: "pointer", userSelect: "none", fontWeight: 500 }}
                              onMouseEnter={(e) => {
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                               {
  const rawX = e.clientX - rect.left + 12;
  const rawY = e.clientY - rect.top + 12;
  const p = clampTooltipToStage(rawX, rawY);
  setTooltip({ x: p.x, y: p.y, text: a.northStar });
}

                              }}
                              onMouseMove={(e) => {
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                setTooltip((prev) => {
  if (!prev) return prev;
  const rawX = e.clientX - rect.left + 12;
  const rawY = e.clientY - rect.top + 12;
  const p = clampTooltipToStage(rawX, rawY);
  return { ...prev, x: p.x, y: p.y };
});

                              }}
                              onMouseLeave={() => setTooltip(null)}
                            >
                              {a.label}
                            </text>
                          </g>
                        );
                      })}
{/* Center baby (on top of axis lines) */}
{(() => {
  const babyR = Math.max(22, ringLater * 0.10); // your size is fine, keep this

  return (
    <>
      <defs>
        <clipPath id="babyClip">
          <circle cx={cx2} cy={cy2} r={babyR} />
        </clipPath>
      </defs>

     <g
  onClick={(e) => {
    e.stopPropagation();

    // Set direction BEFORE starting the animation
    const dir = babySpinDirRef.current;

    try {
      // rotate format is: "angle cx cy"
      babySpinAnimRef.current?.setAttribute("to", `${dir * 360} ${cx2} ${cy2}`);
      babySpinAnimRef.current?.beginElement();
    } catch {
      // ignore
    }

    // Flip direction for next click
    babySpinDirRef.current = dir === 1 ? -1 : 1;
  }}
  style={{ cursor: "pointer" }}
>

  <animateTransform
    ref={babySpinAnimRef}
    attributeName="transform"
    type="rotate"
    from={`0 ${cx2} ${cy2}`}
    to={`360 ${cx2} ${cy2}`}
    dur="600ms"
    repeatCount="1"
    begin="indefinite"
  />

  <image
    href={babyImg}
    x={cx2 - babyR}
    y={cy2 - babyR}
    width={babyR * 2}
    height={babyR * 2}
    preserveAspectRatio="xMidYMid slice"
    clipPath="url(#babyClip)"
  />
</g>



    </>
  );
})()}

                      {/* Nodes */}
                      {showNodes &&
                      axes.map((axis) => {
                        const axisIndex = axes.findIndex((a) => a.id === axis.id);
                        if (axisIndex === -1) return null;

                        const angle = axisAngleOffset + (-Math.PI / 2 + (axisIndex * 2 * Math.PI) / axes.length);

                        const axisNodes = nodes
                          .filter((n) => n.axisId === axis.id)
                          .slice()
                          .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

                        const count = axisNodes.length;

                        // Dots sit on their ring radius (Now/Next/Later), with tiny spread to avoid overlap
const ringRadiusById: Record<string, number> = {
  now: ringNow,
  next: ringNext,
  later: ringLater,
};

const spread = 18;

// group nodes on this axis by ring so we can spread within each ring
const nodesByRing = rings.reduce((acc2, r) => {
  acc2[r.id] = axisNodes.filter((n) => n.ringId === r.id);
  return acc2;
}, {} as Record<string, NodeItem[]>);

// If we have ANY uncommitted nodes on this axis, we want the OUTER band to be shared by:
//   - Later
//   - Uncommitted
// so we don’t pin Later to the edge and then stack uncommitted on top of it.

// Helpers: compute a "raw" dot radius the same way everywhere (base ring + spread)
const rawDotR = (node: NodeItem) => {
  const base = ringRadiusById[node.ringId] ?? ringLater;

  const ringList = nodesByRing[node.ringId] ?? [];
  const idx = ringList.findIndex((x) => x.id === node.id);
  const k = ringList.length;

  const offset = k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread; // -spread .. +spread
  return base + offset;
};

const uncommittedList = nodesByRing["uncommitted"] ?? [];
const hasUncommitted = uncommittedList.length > 0;

// “InnerCommitted” means “everything BEFORE the outer band”
// i.e. Now/Next only (we intentionally exclude Later here when uncommitted exists)
const innerCommittedNodes = axisNodes.filter(
  (n) => n.ringId !== "uncommitted" && n.ringId !== "later"
);

const innerCommittedMaxRawR =
  innerCommittedNodes.length === 0 ? 0 : Math.max(...innerCommittedNodes.map(rawDotR));

// Outer band nodes (only used when there is at least one uncommitted)
const outerBandNodes = hasUncommitted
  ? axisNodes.filter((n) => n.ringId === "later" || n.ringId === "uncommitted")
  : [];

const outerBandCount = outerBandNodes.length;

// Start of the shared outer band: after the last Now/Next dot (or center if none)
const outerBandStartR = innerCommittedMaxRawR;
// End of the shared outer band is the outer edge
const outerBandEndR = ringLater;


return axisNodes.map((n) => {
  const ringList = nodesByRing[n.ringId] ?? [];
  const idx = ringList.findIndex((x) => x.id === n.id);
  const k = ringList.length;

  let baseR = ringRadiusById[n.ringId] ?? ringLater;
let offset = k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread; // default spread behavior

// If there is ANY uncommitted node on this axis, Later + Uncommitted share the outer band.
// That means Later should NOT pin to the edge; it should be spaced along with uncommitted.
if (hasUncommitted && (n.ringId === "later" || n.ringId === "uncommitted")) {
  // Preserve stable order by sequence (then label) within the outer band
  const orderedOuter = outerBandNodes
    .slice()
    .sort((a, b) => a.sequence - b.sequence || a.label.localeCompare(b.label));

  const i = orderedOuter.findIndex((x) => x.id === n.id);
  const gap = outerBandCount <= 0 ? 0 : (outerBandEndR - outerBandStartR) / (outerBandCount + 1);

  baseR = outerBandStartR + (i + 1) * gap;

  // No spread needed because we already spaced them radially
  offset = 0;
} else if (n.ringId === "uncommitted") {
  // Fallback (shouldn’t happen because hasUncommitted would be true),
  // but keep safe behavior if logic changes later:
  baseR = ringLater * 0.85;
  offset = 0;
}


  const rawR = baseR + offset;

  // Never allow dots to go outside the outer ring
  // Visual polish: if "Later" has exactly 1 node on this axis (and no uncommitted),
// pull it slightly inside the shore.
const SINGLE_LATER_INSET = 14;

const laterList = nodesByRing["later"] ?? [];
const hasUncommittedOnAxis = (nodesByRing["uncommitted"] ?? []).length > 0;

const isSingleLater =
  !hasUncommittedOnAxis && n.ringId === "later" && laterList.length === 1;

// Outer clamp (keep dots inside ring)
const maxR = ringLater - (isSingleLater ? SINGLE_LATER_INSET : 10);

  let r = Math.min(rawR, maxR);

// Manual nudge override (radial position)
// Back-compat: if rOverride <= ~1.5, treat it as normalized (0..1 of ringLater). Otherwise treat as legacy px.
if (n.rOverride != null && Number.isFinite(n.rOverride)) {
  const v = n.rOverride;
  const px = v <= 1.5 ? v * ringLater : v; // normalized -> px
  r = Math.min(Math.max(0, px), maxR);
}



                          const baseX = cx2 + r * Math.cos(angle);
const baseY = cy2 + r * Math.sin(angle);

const isDraggingThis = draggingNodeId === n.id && dragPos != null && didDragRef.current;
const x = isDraggingThis ? dragPos!.x : baseX;
const y = isDraggingThis ? dragPos!.y : baseY;

const isSelected = selectedNodeId === n.id;


                          return (
                            <g
                              key={n.id}
                              onPointerDown={(e) => {
  e.preventDefault();
  e.stopPropagation();

  // --- Manual double-click detection ---
  const now = Date.now();
  const last = lastPointerDownRef.current;

  if (last && last.id === n.id && now - last.t < 320) {
    // Treat as double click → start inline edit and DO NOT begin drag
    lastPointerDownRef.current = null;

    // kill any pending drag state
    activePointerIdRef.current = null;
    dragStartClientRef.current = null;
    didDragRef.current = false;
    setDraggingNodeId(null);
    setDragPos(null);

    startInlineNodeEdit(n.id, n.label, x, y);
    return;
  }

  lastPointerDownRef.current = { id: n.id, t: now };

  // Normal behavior: toggle select + allow dragging
  setSelectedNodeId((prev) => {
    const next = prev === n.id ? null : n.id;
    if (next) expandAxis(n.axisId);
    return next;
  });


  activePointerIdRef.current = e.pointerId;
  dragStartClientRef.current = { x: e.clientX, y: e.clientY };
  didDragRef.current = false;

  setDraggingNodeId(n.id);
  setDragPos({ x, y });

  try {
    (e.currentTarget as any).setPointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }
}}



                              onMouseEnter={(e) => {
                                if (showNodeLabels) return;
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                setNodeTooltip({
                                  x: e.clientX - rect.left + 12,
                                  y: e.clientY - rect.top + 12,
                                  text: n.label,
                                });
                              }}
                              onMouseMove={(e) => {
                                if (showNodeLabels) return;
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                setNodeTooltip((prev) =>
                                  prev ? { ...prev, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 } : prev
                                );
                              }}
                              onMouseLeave={() => {
                                if (showNodeLabels) return;
                                setNodeTooltip(null);
                              }}
                              style={{ cursor: "pointer" }}
                            >
                                                            <circle
                                cx={x}
                                cy={y}
                                r={isSelected ? 11 : 8}
                                fill={isSelected ? "#111" : "#0CE7A8"}
                                stroke={isSelected ? "#0CE7A8" : "rgba(0,0,0,0.25)"}
                                strokeWidth={isSelected ? 3 : 1}
                                onDoubleClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  startInlineNodeEdit(n.id, n.label, x, y);
                                }}
                              />


                             {showNodeLabels && (() => {
  const wrapW = n.wrapWidth ? Math.max(60, Math.min(360, n.wrapWidth)) : null;
  const lines = wrapW ? wrapNodeLabel(n.label, wrapW) : [n.label];

  // vertically center multi-line labels around the node
  const lineH = NODE_LABEL_LINE_H;
  const startY = y - ((lines.length - 1) * lineH) / 2;

  const textX = x + 12;

  const handleX = wrapW ? (textX + wrapW) : (textX + 220); // fallback handle pos if you want to enable even when unwrapped

  return (
    <g>
      <text
        x={textX}
        y={startY}
        fontSize={NODE_LABEL_FONT_SIZE}
        fill={isSelected ? "#111" : "#333"}
        style={{ fontWeight: isSelected ? 600 : 300, cursor: "text", userSelect: "none" }}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startInlineNodeEdit(n.id, n.label, x, y);
        }}
      >
        {lines.map((ln, idx) => (
          <tspan key={idx} x={textX} dy={idx === 0 ? 0 : lineH}>
            {ln}
          </tspan>
        ))}
      </text>

      {/* Slides-style wrap handle (only when selected) */}
      {isSelected && (
        <g
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setResizingWrapNodeId(n.id);

            const currentW = n.wrapWidth ? n.wrapWidth : DEFAULT_NODE_WRAP_WIDTH;
            wrapResizeStartRef.current = { x: e.clientX, w: currentW };

            try {
              (e.currentTarget as any).setPointerCapture?.(e.pointerId);
            } catch {}
          }}
        >
          {/* faint guide line */}
          <line
            x1={textX + (n.wrapWidth ?? DEFAULT_NODE_WRAP_WIDTH)}
            y1={startY - 10}
            x2={textX + (n.wrapWidth ?? DEFAULT_NODE_WRAP_WIDTH)}
            y2={startY + (lines.length - 1) * lineH + 10}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={1}
          />

          {/* grab handle */}
          <rect
            x={textX + (n.wrapWidth ?? DEFAULT_NODE_WRAP_WIDTH) - 5}
            y={y - 6}
            width={10}
            height={12}
            rx={4}
            fill="rgba(0,0,0,0.22)"
            style={{ cursor: "ew-resize" }}
          />
        </g>
      )}
    </g>
  );
})()}


                            </g>
                          );
                        });
                      })}
                    </g>
                  </svg>

                  {tooltip && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        pointerEvents: "none",
                        transform: `translate(${tooltip.x}px, ${tooltip.y}px)`,
                        background: "white",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: "#333",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
                        maxWidth: 280,
                        lineHeight: 1.25,
                      }}
                    >
                      {tooltip.text}
                    </div>
                  )}

                  {nodeTooltip && !showNodeLabels && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        pointerEvents: "none",
                        transform: `translate(${nodeTooltip.x}px, ${nodeTooltip.y}px)`,
                        background: "white",
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: "#333",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
                        maxWidth: 280,
                        lineHeight: 1.25,
                      }}
                    >
                      {nodeTooltip.text}
                    </div>
                  )}

                  {/* Inline node label editor overlay */}
                  {editingNodeId && editingNodePos && (
                    <input
                      ref={editNodeInputRef}
                      value={editingNodeValue}
                      onChange={(e) => setEditingNodeValue(e.target.value)}
                      onBlur={() => commitInlineNodeEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitInlineNodeEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelInlineNodeEdit();
                        }
                      }}
                      onMouseDown={(e) => {
                        // prevent dragging/selecting behind the input
                        e.stopPropagation();
                      }}
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        transform: `translate(${Math.round(editingNodePos.left + 14)}px, ${Math.round(
                          editingNodePos.top - 12
                        )}px)`,
                        width: 220,
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.18)",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
                        fontSize: 13,
                        fontFamily:
                          '"Outfit", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
                        outline: "none",
                      }}
                    />
                  )}
                </div>

              );
                       })()}
    </div>
  </div>
</main>

      </div>
    </div>
  );
}
