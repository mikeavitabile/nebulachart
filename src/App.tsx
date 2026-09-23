import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cloud, cloudErrorMessage, CloudAccessError, CloudConflictError, listCloudSnapshots, putCloudSnapshot, removeCloudSnapshot, listNebulaShares, shareNebula, sendShareInvitation, unshareNebula, type NebulaShare, type CloudAccess } from "./cloud";

import babyImg from "./assets/star-2.png";
import babyIslandImg from "./assets/baby-no-border.png";
import "./App.css";

function GravitationalCore({
  opacity = 0.35,        // overall strength
  pulse = true,          // super slow "breathing"
}: {
  opacity?: number;
  pulse?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
        zIndex: 0,
      }}
    >
      <defs>
        {/* Soft, warm-to-cool core gradient */}
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#ffb36b" stopOpacity="0.85" />
          <stop offset="22%" stopColor="#ff6f7d" stopOpacity="0.55" />
          <stop offset="48%" stopColor="#a86cff" stopOpacity="0.30" />
          <stop offset="72%" stopColor="#3b1f8a" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Extra haze layer (very subtle) */}
        <radialGradient id="outerHaze" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#b97cff" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#5a2bd6" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Blur for softness */}
        <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        {/* A tiny bit of texture so it feels "cosmic" not like a flat circle */}
        <filter id="grain" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 0.10 0
          " />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </defs>

      {/* Outer haze */}
      <circle cx="50" cy="50" r="46" fill="url(#outerHaze)" filter="url(#softBlur)" />

      {/* Main core glow */}
      <g filter="url(#softBlur)">
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="url(#coreGlow)"
          className={pulse ? "nebula-core-pulse" : undefined}
        />
      </g>

      {/* Subtle textured layer */}
      <g opacity="0.55" filter="url(#grain)">
        <circle cx="50" cy="50" r="30" fill="url(#coreGlow)" />
      </g>

      {/* Dark center mass (gives it gravity) */}
      <circle cx="50" cy="50" r="10.5" fill="#05030a" opacity="0.55" />
      <circle cx="50" cy="50" r="7.0"  fill="#000000" opacity="0.55" />
    </svg>
  );
}

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
  complete?: boolean;        // ✅ new: node is done
};

type ThemeId = "nebula" | "halloween" | "island" | "pizza" | "boardroom";

type NebulaTheme = {
  id: ThemeId;
  label: string;
  icon: string;
  cosmic: boolean;
  chartBackground: string;
  exportBackground: string;
  axisColor: string;
  chartText: string;
  chartTextMuted: string;
  boundaryColor: string;
  nodeOutline: string;
  uncommittedNode: string;
  selectionFill: string;
  selectionStroke: string;
  selectionShadow: string;
  nodeColor: string | null;
  nodeRadius: number;
  nodeLabelColor: string;
  nodeLabelStroke: string | null;
  ringColors: Record<"now" | "next" | "later", string>;
  blobs: Array<{ fill: string; stroke: string; strokeWidth: number }>;
};

const THEME_STORAGE_KEY = "nebula-theme-v1";
const THEME_ORDER: ThemeId[] = ["nebula", "halloween", "island", "pizza", "boardroom"];

const THEMES: Record<ThemeId, NebulaTheme> = {
  nebula: {
    id: "nebula",
    label: "Nebula",
    icon: "✦",
    cosmic: true,
    chartBackground: "#05040b",
    exportBackground: "#05050a",
    axisColor: "rgba(255,255,255,0.16)",
    chartText: "rgba(245,247,255,0.92)",
    chartTextMuted: "rgba(245,247,255,0.86)",
    boundaryColor: "rgba(255,255,255,0.16)",
    nodeOutline: "rgba(255,255,255,0.22)",
    uncommittedNode: "rgba(245,247,255,0.78)",
    selectionFill: "rgba(255,255,255,0.14)",
    selectionStroke: "#ff4fa0",
    selectionShadow: "drop-shadow(0 0 10px rgba(255,79,160,0.28)) drop-shadow(0 0 14px rgba(157,88,255,0.20))",
    nodeColor: null,
    nodeRadius: 6,
    nodeLabelColor: "rgba(245,247,255,0.86)",
    nodeLabelStroke: null,
    ringColors: { now: "#FF954D", next: "#FF4FA0", later: "#9D58FF" },
    blobs: [
      { fill: "rgba(255,149,77,0.28)", stroke: "rgba(255,149,77,0.5)", strokeWidth: 1.15 },
      { fill: "rgba(255,79,160,0.22)", stroke: "rgba(255,79,160,0.5)", strokeWidth: 1.15 },
      { fill: "rgba(157,88,255,0.18)", stroke: "rgba(157,88,255,0.5)", strokeWidth: 1.25 },
    ],
  },
  island: {
    id: "island",
    label: "Island",
    icon: "◒",
    cosmic: false,
    chartBackground: "#d9f4ff",
    exportBackground: "#ffffff",
    axisColor: "rgba(31,57,70,0.52)",
    chartText: "#243746",
    chartTextMuted: "#243746",
    boundaryColor: "rgba(31,57,70,0.24)",
    nodeOutline: "rgba(20,87,74,0.62)",
    uncommittedNode: "#f7fbfc",
    selectionFill: "#ffffff",
    selectionStroke: "#086f5a",
    selectionShadow: "drop-shadow(0 0 7px rgba(8,111,90,0.28))",
    nodeColor: "#08d6a4",
    nodeRadius: 8,
    nodeLabelColor: "#243746",
    nodeLabelStroke: null,
    ringColors: { now: "#62e3bb", next: "#19c99b", later: "#12996f" },
    blobs: [
      { fill: "#62e3bb", stroke: "none", strokeWidth: 0 },
      { fill: "#19c99b", stroke: "none", strokeWidth: 0 },
      { fill: "#12996f", stroke: "none", strokeWidth: 0 },
    ],
  },
  pizza: {
    id: "pizza",
    label: "Pizza",
    icon: "🍕",
    cosmic: false,
    chartBackground: "#f1c98e",
    exportBackground: "#fff9ee",
    axisColor: "rgba(82,39,22,0.50)",
    chartText: "#4a2418",
    chartTextMuted: "#4a2418",
    boundaryColor: "rgba(120,63,29,0.38)",
    nodeOutline: "rgba(91,28,19,0.64)",
    uncommittedNode: "#fff4dc",
    selectionFill: "#fff9ee",
    selectionStroke: "#7d1816",
    selectionShadow: "drop-shadow(0 0 7px rgba(125,24,22,0.32))",
    nodeColor: "#ffd24a",
    nodeRadius: 8,
    nodeLabelColor: "#ffffff",
    nodeLabelStroke: "rgba(72,18,14,0.72)",
    ringColors: { now: "#f36b4f", next: "#d83e31", later: "#9f2022" },
    blobs: [
      { fill: "#f36b4f", stroke: "none", strokeWidth: 0 },
      { fill: "#d83e31", stroke: "none", strokeWidth: 0 },
      { fill: "#9f2022", stroke: "none", strokeWidth: 0 },
    ],
  },
  halloween: {
    id: "halloween",
    label: "Halloween",
    icon: "🎃",
    cosmic: false,
    chartBackground: "#000000",
    exportBackground: "#000000",
    axisColor: "rgba(255,255,255,0.24)",
    chartText: "#fff5e8",
    chartTextMuted: "#fff5e8",
    boundaryColor: "rgba(255,138,0,0.42)",
    nodeOutline: "rgba(56,22,0,0.86)",
    uncommittedNode: "#fff1dc",
    selectionFill: "#fff5e8",
    selectionStroke: "#ff7a00",
    selectionShadow: "drop-shadow(0 0 8px rgba(255,122,0,0.48))",
    nodeColor: "#ffb000",
    nodeRadius: 8,
    nodeLabelColor: "#fff5e8",
    nodeLabelStroke: "rgba(0,0,0,0.82)",
    ringColors: { now: "#ffad42", next: "#f57600", later: "#b93800" },
    blobs: [
      { fill: "rgba(255,173,66,0.28)", stroke: "none", strokeWidth: 0 },
      { fill: "rgba(245,118,0,0.22)", stroke: "none", strokeWidth: 0 },
      { fill: "rgba(185,56,0,0.18)", stroke: "none", strokeWidth: 0 },
    ],
  },
  boardroom: {
    id: "boardroom",
    label: "Boardroom",
    icon: "🏢",
    cosmic: false,
    chartBackground: "#f7f9fb",
    exportBackground: "#ffffff",
    axisColor: "rgba(38,65,89,0.44)",
    chartText: "#1f3448",
    chartTextMuted: "#1f3448",
    boundaryColor: "rgba(38,65,89,0.25)",
    nodeOutline: "rgba(25,67,103,0.62)",
    uncommittedNode: "#f7f9fb",
    selectionFill: "#ffffff",
    selectionStroke: "#245f91",
    selectionShadow: "drop-shadow(0 0 7px rgba(36,95,145,0.24))",
    nodeColor: "#287fbd",
    nodeRadius: 8,
    nodeLabelColor: "#1f3448",
    nodeLabelStroke: null,
    ringColors: { now: "#9accec", next: "#559ed0", later: "#286690" },
    blobs: [
      { fill: "rgba(202,228,245,0.72)", stroke: "rgba(85,158,208,0.78)", strokeWidth: 1.1 },
      { fill: "rgba(85,158,208,0.38)", stroke: "rgba(40,102,144,0.66)", strokeWidth: 1.1 },
      { fill: "rgba(40,102,144,0.18)", stroke: "rgba(31,82,119,0.58)", strokeWidth: 1.1 },
    ],
  },
};


// Built-in snapshot templates (module-scope so they’re safe to reference)
const BUILTIN_BLANK_SNAPSHOT: NebulaSnapshotV1 = {
  id: "builtin-blank",
  name: "Blank Nebula",
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



type NebulaSavedStateV1 = {
  v: 1;
  savedAt: number;
  title: string;
  subtitle: string;
  axes: Axis[];
  rings: Ring[];
  nodes: NodeItem[];
};

const valuesMatch = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeValue<T>(base: T, local: T, remote: T): T {
  return valuesMatch(local, base) ? remote : local;
}

function mergeItem<T extends { id: string }>(base: T | undefined, local: T, remote: T): T {
  if (!base) return { ...remote, ...local };
  const merged = { ...remote } as T;
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach((key) => {
    if (key === 'id') return;
    const field = key as keyof T;
    merged[field] = mergeValue(base[field], local[field], remote[field]);
  });
  return merged;
}

function mergeItems<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const baseOrder = base.map((item) => item.id);
  const localOrder = local.map((item) => item.id);
  const remoteOrder = remote.map((item) => item.id);
  const preferredOrder = valuesMatch(localOrder, baseOrder) ? remoteOrder : localOrder;
  const ids = [...new Set([...preferredOrder, ...remoteOrder, ...localOrder])];

  return ids.flatMap((id) => {
    const baseItem = baseById.get(id);
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);

    // If an existing item was deleted on either side, deletion wins.
    if (baseItem && (!localItem || !remoteItem)) return [];
    if (localItem && remoteItem) return [mergeItem(baseItem, localItem, remoteItem)];
    return localItem ? [localItem] : remoteItem ? [remoteItem] : [];
  });
}

function mergeNebulaState(base: NebulaSavedStateV1, local: NebulaSavedStateV1, remote: NebulaSavedStateV1): NebulaSavedStateV1 {
  return {
    v: 1,
    savedAt: Date.now(),
    title: mergeValue(base.title, local.title, remote.title),
    subtitle: mergeValue(base.subtitle, local.subtitle, remote.subtitle),
    axes: mergeItems(base.axes, local.axes, remote.axes),
    rings: mergeItems(base.rings, local.rings, remote.rings),
    nodes: mergeItems(base.nodes, local.nodes, remote.nodes),
  };
}

type NebulaSnapshotV1 = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: NebulaSavedStateV1;
  ownerId?: string;
  ownerEmail?: string;
  access?: CloudAccess;
  revision?: number;
};

type PresentPerson = {
  userId: string;
  email: string;
  alias: string;
  emoji: string;
  color: string;
};

const PRESENCE_ANIMALS = [
  ['Otter', '🦦'], ['Fox', '🦊'], ['Owl', '🦉'], ['Panda', '🐼'],
  ['Koala', '🐨'], ['Tiger', '🐯'], ['Penguin', '🐧'], ['Frog', '🐸'],
  ['Rabbit', '🐰'], ['Bear', '🐻'], ['Lion', '🦁'], ['Whale', '🐳'],
] as const;
const PRESENCE_COLORS = [
  ['Violet', '#7c5cff'], ['Blue', '#3487f7'], ['Teal', '#13a89e'],
  ['Green', '#3aa655'], ['Amber', '#d68b13'], ['Coral', '#e45f5f'],
  ['Pink', '#cf4f9b'], ['Indigo', '#5267d8'],
] as const;

function presenceIdentity(userId: string, email: string): PresentPerson {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const animal = PRESENCE_ANIMALS[unsigned % PRESENCE_ANIMALS.length];
  const color = PRESENCE_COLORS[Math.floor(unsigned / PRESENCE_ANIMALS.length) % PRESENCE_COLORS.length];
  return { userId, email, alias: `${color[0]} ${animal[0]}`, emoji: animal[1], color: color[1] };
}


function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function readSnapshots(): NebulaSnapshotV1[] {
  const parsed = safeParseJSON<NebulaSnapshotV1[]>(localStorage.getItem(SNAPSHOTS_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

function ensureUncommittedRing(rings: Ring[]): Ring[] {
  const has = rings.some((r) => r.id === "uncommitted");
  if (has) return rings;

  return [...rings, { id: "uncommitted", label: "Uncommitted" }];
}

function migrateSnapshotsAddUncommitted(existing: NebulaSnapshotV1[]) {
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


function writeSnapshots(next: NebulaSnapshotV1[]) {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
}

// (removed) ensureBlankSnapshot() — it referenced App-scoped constants (BLANK_AXES / DEFAULT_RINGS / BLANK_NODES)



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
  theme: NebulaTheme;
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
    theme,
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

  const styles = theme.blobs;


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


type PublicPageKind = "about" | "privacy" | "terms";

const PUBLIC_PAGE_COPY: Record<PublicPageKind, { title: string; eyebrow: string; body: ReactNode }> = {
  about: {
    eyebrow: "About Nebula",
    title: "Shape strategy together.",
    body: (
      <>
        <p>Nebula is a collaborative visual strategy-mapping tool. It helps teams organize priorities across strategic axes and time horizons, then discuss and refine the map together in real time.</p>
        <h2>What Nebula does</h2>
        <ul>
          <li>Create visual strategy maps with rings, axes, and movable nodes.</li>
          <li>Save maps securely to your account.</li>
          <li>Share maps with view-only or editing access.</li>
          <li>Collaborate with teammates and see changes shortly after they happen.</li>
        </ul>
        <p>Nebula uses Google Sign-In or passwordless email links for authentication. Google Sign-In is used only to identify you; Nebula does not request access to Gmail, Drive, Calendar, contacts, or your Google password.</p>
      </>
    ),
  },
  privacy: {
    eyebrow: "Legal",
    title: "Privacy Policy",
    body: (
      <>
        <p className="publicMeta">Effective September 22, 2026</p>
        <p>Nebula collects only the information needed to authenticate users, save strategy maps, support sharing, and provide collaboration features.</p>
        <h2>Information we collect</h2>
        <p>When you use Google Sign-In, Nebula may receive your email address, name, profile image, and a unique account identifier from Google. When you use email sign-in, Nebula receives your email address and account identifier. We also store the Nebulas you create or edit, sharing permissions, timestamps, and limited collaboration presence information.</p>
        <h2>How we use information</h2>
        <p>We use this information to authenticate you, display and save your work, enforce sharing permissions, synchronize collaboration, send transactional account or sharing messages, maintain security, and operate the service.</p>
        <h2>Google user data</h2>
        <p>Nebula requests only basic identity information through Google Sign-In. It does not access Gmail, Google Drive, Google Calendar, contacts, or your Google password. Google account information is not used for advertising and is not sold.</p>
        <h2>Service providers</h2>
        <p>Nebula relies on Google for optional sign-in, Supabase for authentication and cloud data, Vercel for hosting, and Resend for transactional email. These providers process information only as needed to deliver their respective services.</p>
        <h2>Retention and deletion</h2>
        <p>Account and workspace information is retained while your account is active or as needed to operate and protect the service. You may request deletion of your account and associated personal information by contacting us.</p>
        <h2>Contact</h2>
        <p>Privacy questions and deletion requests may be sent to <a href="mailto:privacy@nebulachart.com">privacy@nebulachart.com</a>.</p>
      </>
    ),
  },
  terms: {
    eyebrow: "Legal",
    title: "Terms of Service",
    body: (
      <>
        <p className="publicMeta">Effective September 22, 2026</p>
        <p>By using Nebula, you agree to these terms. Nebula is a collaborative strategy-mapping service that is currently evolving and may change over time.</p>
        <h2>Your account</h2>
        <p>You are responsible for activity performed through your account and for maintaining access to the Google account or email address you use to sign in. Do not attempt to access another person’s account.</p>
        <h2>Your content</h2>
        <p>You retain ownership of the content you enter into Nebula. You grant Nebula permission to store, process, and display that content solely as necessary to operate the service. You are responsible for ensuring you have the right to submit and share your content.</p>
        <h2>Sharing and collaboration</h2>
        <p>You control who may view or edit your Nebulas. Collaborators with editing access may change shared content. Review sharing permissions before distributing a link or invitation.</p>
        <h2>Acceptable use</h2>
        <p>Do not use Nebula to break the law, infringe others’ rights, distribute malicious material, probe the service for vulnerabilities, or disrupt the service or other users.</p>
        <h2>Availability and warranty</h2>
        <p>Nebula is provided on an “as is” and “as available” basis. We do not guarantee uninterrupted operation, permanent storage, or that every feature will remain available. Keep independent copies of critical information.</p>
        <h2>Changes</h2>
        <p>These terms may be updated as Nebula develops. Continued use after an update means you accept the revised terms.</p>
        <h2>Contact</h2>
        <p>Questions about these terms may be sent to <a href="mailto:privacy@nebulachart.com">privacy@nebulachart.com</a>.</p>
      </>
    ),
  },
};

function PublicPage({ kind }: { kind: PublicPageKind }) {
  const page = PUBLIC_PAGE_COPY[kind];
  return (
    <div className="publicPageShell">
      <header className="publicHeader">
        <a className="publicBrand" href="/">Nebula</a>
        <nav aria-label="Public pages">
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a className="publicSignIn" href="/">Sign in</a>
        </nav>
      </header>
      <main className="publicContent">
        <div className="publicEyebrow">{page.eyebrow}</div>
        <h1>{page.title}</h1>
        <div className="publicBody">{page.body}</div>
      </main>
      <footer className="publicFooter">Nebula · A visual system for shaping strategy</footer>
    </div>
  );
}

function NebulaApp() {
  // --- Defaults (used for Reset + as fallback) ---
  const DEFAULT_TITLE = "Example Product Strategy";
  const DEFAULT_SUBTITLE = "Nebula — Workshop Edition";

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
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return THEME_ORDER.includes(saved as ThemeId) ? saved as ThemeId : "nebula";
    } catch {
      return "nebula";
    }
  });
  const theme = THEMES[themeId];

  const chooseTheme = (nextTheme: ThemeId) => {
    setThemeId(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  };

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
  const workingStateRef = useRef<NebulaSavedStateV1>({
    v: 1,
    savedAt: Date.now(),
    title,
    subtitle,
    axes,
    rings,
    nodes,
  });
  workingStateRef.current = {
    v: 1,
    savedAt: lastSavedAt ?? Date.now(),
    title,
    subtitle,
    axes,
    rings,
    nodes,
  };

  const stageRef = useRef<HTMLDivElement | null>(null);
  const { ref: measuredStageRef, size: measuredStageSize } = useSize<HTMLDivElement>();

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

// ✅ Always-accurate selection for pointer handlers (avoids stale state in onPointerUp)
const selectedNodeIdRef = useRef<string | null>(null);

useLayoutEffect(() => {
  selectedNodeIdRef.current = selectedNodeId;
}, [selectedNodeId]);
  const nebulaSpinAnimRef = useRef<SVGAnimateTransformElement | null>(null);
const nebulaSpinDirRef = useRef<1 | -1>(1); // 1 = clockwise, -1 = counter-clockwise


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

  // ✅ new: hide completed nodes/labels on the chart
  const [hideCompleted, setHideCompleted] = useState(false);

  const [nodeTooltip, setNodeTooltip] = useState<{ x: number; y: number; text: string } | null>(
    null
  );
  const [showNowBlob, setShowNowBlob] = useState(true);
  const [showNextBlob, setShowNextBlob] = useState(true);
  const [showLaterBlob, setShowLaterBlob] = useState(true);

  // --- Ring toggle button styling ---
  const RING_COLORS: Record<string, string> = theme.ringColors;
  const RING_BLOB_FILLS: Record<"now" | "next" | "later", string> = {
    now: theme.blobs[0].fill,
    next: theme.blobs[1].fill,
    later: theme.blobs[2].fill,
  };


    const ringToggleBtnStyle = (on: boolean, color: string) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: `1px solid ${on ? "var(--theme-border)" : `${color}`}`,
    background: on ? color : "var(--theme-button-bg)",
    color: "var(--theme-text)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    boxShadow: theme.id === "nebula" && on
      ? "0 10px 26px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.06) inset"
      : theme.id === "nebula" ? "0 0 0 1px rgba(255,255,255,0.04) inset" : "none",
    backdropFilter: "blur(6px)",
  });

  const ringMasterBtnStyle = (on: boolean) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--theme-border)",
    background: on ? "var(--theme-button-active)" : "var(--theme-button-bg)",
    color: "var(--theme-text)",
    fontSize: 13,
    fontWeight: 850,
    cursor: "pointer",
    lineHeight: 1,
    boxShadow: theme.id === "nebula" && on ? "0 10px 26px rgba(0,0,0,0.35)" : "none",
    backdropFilter: "blur(6px)",
  });

  // --- Dark mode form controls (used by Nodes editor) ---
  const darkFieldStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--theme-input)",
    color: "var(--theme-text)",
    border: "1px solid var(--theme-border)",
    borderRadius: 10,
    outline: "none",
    boxShadow:
      "0 0 0 1px var(--theme-border) inset, 0 10px 24px rgba(0,0,0,0.12)",
    backdropFilter: "blur(8px)",
  };


  const darkSelectStyle: React.CSSProperties = {
    ...darkFieldStyle,
    padding: "8px 10px",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  };

  const darkTextareaStyle: React.CSSProperties = {
    ...darkFieldStyle,
    padding: "8px 10px",
    resize: "vertical",
  };



  const [nebulaSpin, setNebulaSpin] = useState(0);
  const [snapshots, setSnapshots] = useState<NebulaSnapshotV1[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [cloudEmail, setCloudEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [cloudStatus, setCloudStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [unavailableStrategyId, setUnavailableStrategyId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [shares, setShares] = useState<NebulaShare[]>([]);
  const [presentPeople, setPresentPeople] = useState<PresentPerson[]>([]);
  // Capture a deep link before auth/session hydration can rewrite the URL to a
  // previously opened Nebula. This keeps inaccessible-link handling reliable
  // for returning users as well as brand-new accounts.
  const requestedStrategyIdRef = useRef<string | null>(getStrategyIdFromUrl());
  const cloudUserRef = useRef<string | null>(null);
  const cloudQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cloudRevisionRef = useRef<Map<string, number>>(new Map());
  const cloudBaseStateRef = useRef<Map<string, NebulaSavedStateV1>>(new Map());
  const cloudConflictRef = useRef<Set<string>>(new Set());
  const localDirtyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const authGenerationRef = useRef(0);
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
        window.alert("That file doesn’t look like a Nebula export.");
        return;
      }

      const s = parsed.state as NebulaSavedStateV1;

      // Minimal validation / normalization
      const nextState: NebulaSavedStateV1 = {
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

// Always ensure the left pane is open + the axis is expanded before scrolling.
const scrollLeftPaneToNode = (nodeId: string) => {
  // If the left panel is hidden (presentation mode), do nothing.
  if (leftCollapsed) return;

  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return;

  // 1) Ensure the Axes & Nodes section is open so rows exist in the DOM
  setNodesOpen(true);

  // 2) Ensure the correct axis is expanded
  expandAxis(n.axisId);

  // 3) Wait for the DOM to render the row, then scroll it into view
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = nodeRowRefs.current[nodeId];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
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
  const buildStatePayload = (): NebulaSavedStateV1 => ({
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
      (activeSnapshotId && snapshots.find((s) => s.id === activeSnapshotId)?.name) || "Nebula"
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

      // 3) Inline the nebula image as a data URL so it always renders in the export
      // nebulaImg is your imported asset URL string
      const babyUrl = String(babyImg);
      const babyDataUrl = await toDataUrl(babyUrl);
      if (babyDataUrl) {
        // Replace any occurrence of the baby asset URL in the serialized SVG
        // (covers href="...", href='...', and cases where Vite rewrites URLs)
        svgText = svgText.split(babyUrl).join(babyDataUrl);
      } else {
        console.warn("PNG export: could not inline baby image (continuing).");
      }

      // Inline the Island center image so it is retained in PNG exports.
      const babyIslandUrl = String(babyIslandImg);
      const babyIslandDataUrl = await toDataUrl(babyIslandUrl);
      if (babyIslandDataUrl) {
        svgText = svgText.split(babyIslandUrl).join(babyIslandDataUrl);
      }

      const scale = 3; // bump to 4 if you want more resolution
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vbW * scale);
      canvas.height = Math.round(vbH * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      // Match the selected personal theme in exported images.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = theme.exportBackground;
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

  const queueCloudWrite = (task: () => Promise<void>) => {
    setSyncStatus("Saving…");
    cloudQueueRef.current = cloudQueueRef.current.catch(() => {}).then(task).then(
      () => setSyncStatus("Live · Saved"),
      (error) => {
        console.error("Cloud save failed:", error);
        if (error instanceof CloudConflictError) {
          setSyncStatus("Editing paused: a collaborator saved newer changes. Refresh to load their version before continuing.");
        } else if (error instanceof CloudAccessError) {
          setSyncStatus("Access removed · Your changes were not saved.");
        } else {
          setSyncStatus(`Save failed: ${cloudErrorMessage(error)}. Retry by saving again.`);
        }
      }
    );
  };

  const persistSnapshot = (snapshot: NebulaSnapshotV1) => {
    const userId = cloudUserRef.current;
    if (!userId || !cloudEmail || snapshot.access === 'view') return;
    if (cloudConflictRef.current.has(snapshot.id)) {
      setSyncStatus("Editing paused: refresh to load the collaborator's newer version.");
      return;
    }

    const expectedRevision = cloudRevisionRef.current.get(snapshot.id) ?? snapshot.revision ?? 0;
    cloudRevisionRef.current.set(snapshot.id, expectedRevision + 1);
    queueCloudWrite(async () => {
      try {
        const revision = await putCloudSnapshot(userId, cloudEmail, { ...snapshot, revision: expectedRevision });
        cloudRevisionRef.current.set(snapshot.id, revision);
        cloudBaseStateRef.current.set(snapshot.id, snapshot.state);
        localDirtyRef.current = false;
        setSnapshots((prev) => prev.map((item) => item.id === snapshot.id
          ? { ...item, ownerId: item.ownerId ?? userId, ownerEmail: item.ownerEmail ?? cloudEmail, revision }
          : item));
      } catch (error) {
        if (cloudRevisionRef.current.get(snapshot.id) === expectedRevision + 1) {
          cloudRevisionRef.current.set(snapshot.id, expectedRevision);
        }
        if (error instanceof CloudConflictError && error.remoteState) {
          const remoteState = error.remoteState as NebulaSavedStateV1;
          const baseState = cloudBaseStateRef.current.get(snapshot.id) ?? remoteState;
          const localState = snapshot.id === activeSnapshotId ? workingStateRef.current : snapshot.state;
          const mergedState = mergeNebulaState(baseState, localState, remoteState);
          const mergedSnapshot = {
            ...snapshot,
            name: error.remoteName ?? snapshot.name,
            state: mergedState,
            updatedAt: Date.now(),
            revision: error.remoteRevision,
          };

          cloudBaseStateRef.current.set(snapshot.id, remoteState);
          cloudRevisionRef.current.set(snapshot.id, error.remoteRevision + 1);
          const revision = await putCloudSnapshot(userId, cloudEmail, mergedSnapshot);
          cloudRevisionRef.current.set(snapshot.id, revision);
          cloudBaseStateRef.current.set(snapshot.id, mergedState);
          cloudConflictRef.current.delete(snapshot.id);
          localDirtyRef.current = false;
          setSnapshots((prev) => prev.map((item) => item.id === snapshot.id
            ? { ...item, name: mergedSnapshot.name, state: mergedState, updatedAt: mergedSnapshot.updatedAt, revision }
            : item));
          if (snapshot.id === activeSnapshotId) {
            applyingRemoteRef.current = true;
            loadSnapshotIntoState({ ...mergedSnapshot, revision });
            window.requestAnimationFrame(() => { applyingRemoteRef.current = false; });
          }
          return;
        }
        if (error instanceof CloudConflictError) {
          cloudConflictRef.current.add(snapshot.id);
          cloudRevisionRef.current.set(snapshot.id, error.remoteRevision);
        }
        throw error;
      }
    });
  };

  const activateCloudAccount = async (userId: string | null, email: string | null) => {
    if (userId && userId === cloudUserRef.current) return;
    const generation = ++authGenerationRef.current;
    hasHydratedRef.current = false;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    setCloudLoading(true);
    setCloudStatus(userId ? "Loading cloud Nebulas…" : "");
    try {
      // Finish pending writes before replacing the account's chart list.
      await cloudQueueRef.current;
      if (generation !== authGenerationRef.current) return;
      const next = userId && email ? await listCloudSnapshots<NebulaSavedStateV1>(userId, email) : [];
      if (generation !== authGenerationRef.current) return;
      cloudUserRef.current = userId;
      setCloudEmail(email);
      if (userId) setAutoSaveEnabled(true);
      cloudRevisionRef.current = new Map(next.map((snapshot) => [snapshot.id, snapshot.revision ?? 1]));
      cloudBaseStateRef.current = new Map(next.map((snapshot) => [snapshot.id, snapshot.state]));
      cloudConflictRef.current.clear();
      setSnapshots(next);
      const requestedId = requestedStrategyIdRef.current;
      const requestedSnapshot = requestedId ? next.find((snapshot) => snapshot.id === requestedId) : undefined;
      const requestedIsUnavailable = Boolean(requestedId && !requestedSnapshot);
      setUnavailableStrategyId(requestedIsUnavailable ? requestedId : null);

      // Never silently replace an inaccessible deep link with an editable-looking
      // local template. Wait for the user to choose where to go next.
      const preferredId = requestedIsUnavailable
        ? null
        : requestedId || localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
      const initial = requestedIsUnavailable
        ? undefined
        : next.find((snapshot) => snapshot.id === preferredId) || next[0];
      setActiveSnapshotId(initial?.id ?? null);
      if (!requestedIsUnavailable) setStrategyIdInUrl(initial?.id ?? null);
      if (initial) {
        applyingRemoteRef.current = true;
        loadSnapshotIntoState(initial);
        window.requestAnimationFrame(() => { applyingRemoteRef.current = false; });
      }
      else resetWorkingState();
      setCloudStatus(userId ? "Cloud ready" : "");
      setSyncStatus(userId && initial ? "Connecting…" : "");
    } catch (error) {
      console.error("Cloud load failed:", error);
      setCloudStatus(`Cloud load failed: ${error instanceof Error ? error.message : String(error)}`);
      // Keep local charts visible when the cloud is unavailable.
    } finally {
      if (generation === authGenerationRef.current) {
        hasHydratedRef.current = true;
        setCloudLoading(false);
        setAuthReady(true);
      }
    }
  };

  useEffect(() => {
    if (!cloud) return;
    const { data: { subscription } } = cloud.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      // Supabase recommends deferring other client calls from auth callbacks.
      window.setTimeout(() => { void activateCloudAccount(session?.user.id ?? null, session?.user.email ?? null); }, 0);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendSignInLink = async () => {
    if (!cloud) return;
    setCloudStatus("Sending sign-in link…");
    const { error } = await cloud.auth.signInWithOtp({
      email: emailInput.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname + window.location.search },
    });
    setCloudStatus(error ? error.message : "Check your email for the sign-in link.");
  };

  const signInWithGoogle = async () => {
    if (!cloud) return;
    setCloudStatus("Opening Google sign-in…");
    const { error } = await cloud.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Keep the requested Nebula in the URL so a shared link survives
        // the round trip through Google and Supabase.
        redirectTo: window.location.origin + window.location.pathname + window.location.search,
      },
    });
    if (error) setCloudStatus(error.message);
  };

  const signOutOfCloud = async () => {
    if (!cloud) return;
    await cloudQueueRef.current;
    const { error } = await cloud.auth.signOut();
    if (error) setCloudStatus(error.message);
  };

  const loadSnapshotIntoState = (snap: NebulaSnapshotV1) => {
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

  const getActiveSnapshot = () => snapshots.find((snapshot) => snapshot.id === activeSnapshotId);
  const activeAccess = getActiveSnapshot()?.access ?? 'owner';
  const activeOwnerEmail = getActiveSnapshot()?.ownerEmail ?? cloudEmail ?? '';

  const openSharing = async () => {
    if (!activeSnapshotId || activeAccess !== 'owner') return;
    setShareOpen(true);
    setShareStatus('Loading sharing…');
    try { setShares(await listNebulaShares(activeSnapshotId)); setShareStatus(''); }
    catch (error) { setShareStatus(cloudErrorMessage(error)); }
  };

  const addShare = async () => {
    const userId = cloudUserRef.current;
    if (!activeSnapshotId || !userId || !shareEmail.trim()) return;
    const recipientEmail = shareEmail.trim().toLowerCase();
    setShareStatus('Sharing…');
    try {
      await shareNebula(activeSnapshotId, userId, recipientEmail, sharePermission);
      setShareEmail('');
      setShares(await listNebulaShares(activeSnapshotId));
      try {
        await sendShareInvitation(activeSnapshotId, recipientEmail);
        setShareStatus('Sharing updated · invitation sent');
      } catch (emailError) {
        setShareStatus(`Access granted, but email failed: ${cloudErrorMessage(emailError)}`);
      }
    } catch (error) { setShareStatus(cloudErrorMessage(error)); }
  };

  const removeShare = async (shareId: string) => {
    if (!activeSnapshotId) return;
    setShareStatus('Removing access…');
    try {
      await unshareNebula(shareId);
      setShares(await listNebulaShares(activeSnapshotId));
      setShareStatus('Access removed');
    }
    catch (error) { setShareStatus(cloudErrorMessage(error)); }
  };

  const copyShareLink = async () => {
    if (!activeSnapshotId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('strategy', activeSnapshotId);
    url.hash = '';
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareStatus('Link copied');
    } catch {
      setShareStatus(`Copy this link: ${url.toString()}`);
    }
  };

  const saveCurrentSnapshot = (reason: "manual" | "autosave" = "manual") => {
    if (!activeSnapshotId) return;
    if (getActiveSnapshot()?.access === 'view') return;

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
          if (cloudUserRef.current) {
            const changed = next.find((sn) => sn.id === activeSnapshotId);
            if (changed) persistSnapshot(changed);
          } else writeSnapshots(next);
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
  overrideState?: NebulaSavedStateV1
) => {


    const now = Date.now();
    const snap: NebulaSnapshotV1 = {
      id: uid(),
      name,
      createdAt: now,
      updatedAt: now,
      state: overrideState ?? buildStatePayload(),
      ownerEmail: cloudEmail ?? undefined,
      access: "owner",
    };

    setSnapshots((prev) => {
      const next = [snap, ...prev];
      try {
        if (cloudUserRef.current) persistSnapshot(snap);
        else writeSnapshots(next);
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

  const createNebulaAfterUnavailableLink = () => {
    requestedStrategyIdRef.current = null;
    setUnavailableStrategyId(null);
    const now = Date.now();
    const blank: NebulaSavedStateV1 = {
      v: 1,
      savedAt: now,
      title: "Untitled Strategy",
      subtitle: "",
      axes: BLANK_AXES,
      rings: DEFAULT_RINGS,
      nodes: BLANK_NODES,
    };
    createSnapshot("Untitled Strategy", true, blank);
  };

  const openOwnedNebulasAfterUnavailableLink = () => {
    const firstAvailable = snapshots[0];
    requestedStrategyIdRef.current = null;
    setUnavailableStrategyId(null);
    if (firstAvailable) loadSnapshotById(firstAvailable.id);
    else setStrategyIdInUrl(null);
  };

  const loadSnapshotById = (id: string) => {
    const found = snapshots.find((s) => s.id === id);
    if (!found) return;

    localDirtyRef.current = false;
    applyingRemoteRef.current = true;
    setActiveSnapshotId(id);
    try {
      localStorage.setItem(ACTIVE_SNAPSHOT_KEY, id);
    } catch {}
    setStrategyIdInUrl(id);

    loadSnapshotIntoState(found);
    window.requestAnimationFrame(() => { applyingRemoteRef.current = false; });
  };

  const renameSnapshot = (id: string, nextName: string) => {
    if (snapshots.find((snapshot) => snapshot.id === id)?.access === 'view') return;
    setSnapshots((prev) => {
      const next = prev.map((sn) => (sn.id === id ? { ...sn, name: nextName } : sn));
      try {
        if (cloudUserRef.current) {
          const changed = next.find((sn) => sn.id === id);
          if (changed) persistSnapshot(changed);
        } else writeSnapshots(next);
      } catch (e) {
        console.warn("Rename failed:", e);
      }
      return next;
    });
  };

  const deleteSnapshot = (id: string) => {
    if ((snapshots.find((snapshot) => snapshot.id === id)?.access ?? 'owner') !== 'owner') return;
    setSnapshots((prev) => {
      const next = prev.filter((sn) => sn.id !== id);
      try {
        if (cloudUserRef.current) queueCloudWrite(() => removeCloudSnapshot(id));
        else writeSnapshots(next);
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
    const copy: NebulaSnapshotV1 = {
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
        if (cloudUserRef.current) persistSnapshot(copy);
        else writeSnapshots(next);
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


// Example nebula
const BUILTIN_EXAMPLE_SNAPSHOT: NebulaSnapshotV1 = {
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
  // Cloud is the source of truth. Authentication hydrates the workspace.
  // Do not seed browser-only snapshots or put their IDs into the URL.
  if (!cloudUserRef.current) return;

  try {
    let existing = readSnapshots();

    // 1) Import legacy single-save ONCE (only if snapshots are empty)
    if (existing.length === 0) {
      const legacy = safeParseJSON<NebulaSavedStateV1>(localStorage.getItem(LEGACY_STORAGE_KEY));
      if (legacy && legacy.v === 1) {
        const now = Date.now();
        const imported: NebulaSnapshotV1 = {
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

      const blank: NebulaSnapshotV1 = {
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

      const example: NebulaSnapshotV1 = {
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

  // Keep the open Nebula synchronized with collaborators through Supabase Realtime.
  useEffect(() => {
    if (!cloudUserRef.current || !activeSnapshotId) {
      setSyncStatus("");
      return;
    }

    const nebulaId = activeSnapshotId;
    setSyncStatus("Connecting…");
    const channel = cloud
      .channel(`nebula-live:${nebulaId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nebulas', filter: `id=eq.${nebulaId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            name: string;
            state: NebulaSavedStateV1;
            created_at: string;
            updated_at: string;
            owner_id: string;
            owner_email: string | null;
            revision: number;
          };
          const remoteRevision = Number(row.revision ?? 0);
          const knownRevision = cloudRevisionRef.current.get(nebulaId) ?? 0;
          if (!remoteRevision || remoteRevision <= knownRevision) return;

          cloudRevisionRef.current.set(nebulaId, remoteRevision);
          const remoteSnapshot: NebulaSnapshotV1 = {
            id: row.id,
            name: row.name,
            createdAt: Date.parse(row.created_at),
            updatedAt: Date.parse(row.updated_at),
            state: row.state,
            ownerId: row.owner_id,
            ownerEmail: row.owner_email ?? undefined,
            access: activeAccess,
            revision: remoteRevision,
          };

          if (localDirtyRef.current || autosaveTimerRef.current) {
            const baseState = cloudBaseStateRef.current.get(nebulaId) ?? row.state;
            const mergedState = mergeNebulaState(baseState, workingStateRef.current, row.state);
            const mergedSnapshot = { ...remoteSnapshot, state: mergedState, updatedAt: Date.now() };

            if (autosaveTimerRef.current) {
              window.clearTimeout(autosaveTimerRef.current);
              autosaveTimerRef.current = null;
            }
            cloudBaseStateRef.current.set(nebulaId, row.state);
            cloudConflictRef.current.delete(nebulaId);
            applyingRemoteRef.current = true;
            setSnapshots((prev) => prev.map((snapshot) => snapshot.id === nebulaId
              ? { ...mergedSnapshot, access: snapshot.access }
              : snapshot));
            loadSnapshotIntoState(mergedSnapshot);
            localDirtyRef.current = !valuesMatch(mergedState, row.state);
            window.requestAnimationFrame(() => { applyingRemoteRef.current = false; });

            if (localDirtyRef.current) {
              setSyncStatus("Merging collaborator changes…");
              persistSnapshot(mergedSnapshot);
            } else {
              setSyncStatus("Live · Updated by collaborator");
            }
            return;
          }

          cloudBaseStateRef.current.set(nebulaId, row.state);
          applyingRemoteRef.current = true;
          if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
          }
          localDirtyRef.current = false;
          setSnapshots((prev) => prev.map((snapshot) => snapshot.id === nebulaId
            ? { ...remoteSnapshot, access: snapshot.access }
            : snapshot));
          loadSnapshotIntoState(remoteSnapshot);
          setSyncStatus("Live · Updated by collaborator");
          window.requestAnimationFrame(() => { applyingRemoteRef.current = false; });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncStatus("Live");
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncStatus("Reconnecting…");
      });

    return () => { void cloud.removeChannel(channel); };
    // activeAccess is captured for the selected Nebula and changes when selection/access changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSnapshotId, activeAccess]);

  // Show the signed-in collaborators who currently have this Nebula open.
  useEffect(() => {
    const userId = cloudUserRef.current;
    if (!userId || !cloudEmail || !activeSnapshotId) {
      setPresentPeople([]);
      return;
    }

    let cancelled = false;
    let presenceChannel: ReturnType<typeof cloud.channel> | null = null;
    const ownPresence = presenceIdentity(userId, cloudEmail);
    setPresentPeople([]);

    const connectPresence = async () => {
      await cloud.realtime.setAuth();
      if (cancelled) return;

      presenceChannel = cloud
        .channel(`nebula:${activeSnapshotId}`, {
          config: { private: true, presence: { key: userId, enabled: true } },
        })
        .on('presence', { event: 'sync' }, () => {
          if (!presenceChannel || cancelled) return;
          const state = presenceChannel.presenceState<PresentPerson>();
          const byUser = new Map<string, PresentPerson>();
          Object.values(state).flat().forEach((person) => {
            if (person.userId && person.email) byUser.set(person.userId, person);
          });
          setPresentPeople([...byUser.values()].sort((a, b) => {
            if (a.userId === userId) return -1;
            if (b.userId === userId) return 1;
            return a.alias.localeCompare(b.alias);
          }));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && presenceChannel && !cancelled) {
            await presenceChannel.track(ownPresence);
          }
        });
    };

    void connectPresence();
    return () => {
      cancelled = true;
      setPresentPeople([]);
      if (presenceChannel) {
        void presenceChannel.untrack();
        void cloud.removeChannel(presenceChannel);
      }
    };
  }, [activeSnapshotId, cloudEmail]);



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

  // axisWarnings removed — sequencing is now auto-derived from ring order + nudges + stable tie-breakers.


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
    if (applyingRemoteRef.current) return;

    localDirtyRef.current = true;
    if (!activeSnapshotId || !cloudConflictRef.current.has(activeSnapshotId)) {
      setSyncStatus("Unsaved changes");
    }

    // clear any pending save
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    // debounce so we don't save on every keystroke
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
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


  // getAxisOrderInfo removed — order is auto-managed

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


  if (!authReady || !cloudEmail) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#05050d",
          color: "rgba(245,247,255,0.96)",
        }}
      >
        <main
          style={{
            width: "min(420px, 100%)",
            padding: "36px 32px",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 20,
            background: "rgba(14,14,25,0.94)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 850, letterSpacing: -1 }}>Nebula</div>
          <p style={{ margin: "8px 0 28px", color: "rgba(245,247,255,0.58)", lineHeight: 1.5 }}>
            A visual system for shaping strategy
          </p>

          {!authReady ? (
            <div style={{ color: "rgba(245,247,255,0.65)" }}>Checking your account…</div>
          ) : (
            <>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>Sign in to continue</div>
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={cloudLoading}
                style={{
                  width: "100%",
                  padding: "13px 16px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  background: "#fff",
                  color: "#1f1f1f",
                  fontSize: 16,
                  fontWeight: 750,
                  cursor: cloudLoading ? "default" : "pointer",
                }}
              >
                Continue with Google
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0", color: "rgba(245,247,255,0.4)", fontSize: 12 }}>
                <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.14)" }} />
                <span>or use email</span>
                <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.14)" }} />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendSignInLink();
                }}
              >
                <input
                  id="nebula-sign-in-email"
                  aria-label="Email address"
                  type="email"
                  required
                  autoComplete="email"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                  placeholder="Email address"
                  style={{
                    boxSizing: "border-box",
                    width: "100%",
                    padding: "13px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(0,0,0,0.28)",
                    color: "inherit",
                    fontSize: 16,
                  }}
                />
                <button
                  type="submit"
                  disabled={!emailInput.trim() || cloudLoading}
                  style={{
                    width: "100%",
                    marginTop: 12,
                    padding: "13px 16px",
                    border: 0,
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: emailInput.trim() && !cloudLoading ? "pointer" : "default",
                  }}
                >
                  Email me a sign-in link
                </button>
              </form>
              <p role="status" style={{ minHeight: 24, margin: "14px 0 0", color: "rgba(245,247,255,0.62)", lineHeight: 1.45 }}>
                {cloudStatus || "Choose Google or receive a secure sign-in link."}
              </p>
              <nav className="authLegalLinks" aria-label="Legal">
                <a href="/about">About</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
              </nav>
            </>
          )}
        </main>
      </div>
    );
  }

  if (unavailableStrategyId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#05050d",
          color: "rgba(245,247,255,0.96)",
        }}
      >
        <main
          style={{
            width: "min(520px, 100%)",
            padding: "38px 34px",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 20,
            background: "rgba(14,14,25,0.96)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ color: "#c09aff", fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Nebula
          </div>
          <h1 style={{ margin: "14px 0 14px", fontSize: 32, lineHeight: 1.08, letterSpacing: -0.8 }}>
            This Nebula isn’t available to your account
          </h1>
          <p style={{ margin: "0 0 10px", color: "rgba(245,247,255,0.66)", lineHeight: 1.6 }}>
            It may not have been shared with <strong style={{ color: "rgba(245,247,255,0.9)" }}>{cloudEmail}</strong>, or the link may no longer be valid.
          </p>
          <p style={{ margin: "0 0 26px", color: "rgba(245,247,255,0.66)", lineHeight: 1.6 }}>
            Ask the person who sent it to confirm your access, or create your own Nebula now.
          </p>

          <button
            type="button"
            onClick={createNebulaAfterUnavailableLink}
            style={{ width: "100%", padding: "13px 16px", border: 0, borderRadius: 10, background: "#fff", color: "#171721", fontSize: 16, fontWeight: 800 }}
          >
            Create a new Nebula
          </button>

          {snapshots.length > 0 && (
            <button
              type="button"
              onClick={openOwnedNebulasAfterUnavailableLink}
              style={{ width: "100%", marginTop: 10, padding: "13px 16px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: "inherit", fontSize: 16, fontWeight: 750 }}
            >
              Open my Nebulas
            </button>
          )}

          <button
            type="button"
            onClick={() => void signOutOfCloud()}
            style={{ display: "block", margin: "20px auto 0", padding: 4, border: 0, background: "transparent", color: "rgba(245,247,255,0.55)", fontSize: 13 }}
          >
            Sign in with a different account
          </button>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`appShell theme-${themeId} ${leftCollapsed ? "noTopHeader" : ""}`}
      data-theme={themeId}
      style={{
        "--theme-bg": themeId === "nebula" ? "#05050a" : themeId === "halloween" ? "#000000" : "#f7fbfc",
        "--theme-panel": themeId === "nebula" ? "rgba(10,10,18,0.55)" : themeId === "halloween" ? "rgba(9,7,5,0.82)" : "rgba(255,255,255,0.88)",
        "--theme-panel-solid": themeId === "nebula" ? "#0c0c16" : themeId === "halloween" ? "#090705" : "#ffffff",
        "--theme-text": themeId === "nebula" ? "rgba(245,247,255,0.92)" : themeId === "halloween" ? "#fff5e8" : "#243746",
        "--theme-muted": themeId === "nebula" ? "rgba(245,247,255,0.58)" : themeId === "halloween" ? "rgba(255,220,184,0.62)" : "#62747d",
        "--theme-border": themeId === "nebula" || themeId === "halloween" ? "rgba(255,255,255,0.14)" : "rgba(36,55,70,0.20)",
        "--theme-button-bg": themeId === "nebula" || themeId === "halloween" ? "rgba(255,255,255,0.06)" : "rgba(36,55,70,0.07)",
        "--theme-button-active": themeId === "nebula" || themeId === "halloween" ? "rgba(255,255,255,0.10)" : "rgba(36,55,70,0.11)",
        "--theme-input": themeId === "nebula" ? "rgba(12,12,22,0.55)" : themeId === "halloween" ? "rgba(14,10,7,0.92)" : "rgba(255,255,255,0.94)",
        "--theme-accent": theme.ringColors.next,
      } as CSSProperties}
    >
      {!leftCollapsed && (
  <header className="header">
    <strong>Nebula</strong>
    <span className="muted">A visual system for shaping strategy</span>

    <button
      type="button"
      className="smallBtn"
      onClick={() => setGuidebookOpen(true)}
      style={{ marginLeft: 10 }}
      title="Open the Nebula Guidebook"
    >
      Guidebook
    </button>

    <label className="themePicker" title="Choose your personal visual theme">
      <span aria-hidden="true">{theme.icon}</span>
      <select
        aria-label="Visual theme"
        value={themeId}
        onChange={(event) => chooseTheme(event.target.value as ThemeId)}
      >
        {THEME_ORDER.map((id) => (
          <option key={id} value={id}>{THEMES[id].label}</option>
        ))}
      </select>
    </label>

    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
      {presentPeople.length > 0 && (
        <div
          aria-label={`${presentPeople.length} ${presentPeople.length === 1 ? 'person' : 'people'} viewing`}
          title={`${presentPeople.length} ${presentPeople.length === 1 ? 'person' : 'people'} viewing`}
          style={{ display: "flex", alignItems: "center", paddingLeft: 6 }}
        >
          {presentPeople.slice(0, 4).map((person, index) => (
            <span
              key={person.userId}
              title={`${person.alias} · ${person.email}${person.userId === cloudUserRef.current ? ' (you)' : ''}`}
              aria-label={`${person.alias}, ${person.email}${person.userId === cloudUserRef.current ? ', you' : ''}`}
              style={{
                width: 30,
                height: 30,
                marginLeft: index === 0 ? 0 : -7,
                borderRadius: "50%",
                border: "2px solid var(--theme-panel-solid)",
                background: person.color,
                display: "grid",
                placeItems: "center",
                fontSize: 16,
                lineHeight: 1,
                cursor: "default",
                boxShadow: "0 1px 4px rgba(0,0,0,0.28)",
                position: "relative",
                zIndex: presentPeople.length - index,
              }}
            >
              {person.emoji}
            </span>
          ))}
          {presentPeople.length > 4 && (
            <span
              title={`${presentPeople.length - 4} more people viewing`}
              style={{
                width: 30,
                height: 30,
                marginLeft: -7,
                borderRadius: "50%",
                border: "2px solid var(--theme-panel-solid)",
                background: "var(--theme-button-active)",
                color: "var(--theme-text)",
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              +{presentPeople.length - 4}
            </span>
          )}
        </div>
      )}
      <span className="muted" style={{ fontSize: 12 }} title={cloudEmail}>
        {cloudEmail}
      </span>
      <button type="button" className="smallBtn" onClick={() => void signOutOfCloud()}>
        Sign out
      </button>
    </div>

    <div>
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
      How to use Nebula!
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
        Nebula is a visual strategy framework built on the idea that roadmaps should convey direction,
        maturity, and purpose without pretending to know the future with fake precision.
      </p>
      <p>
        It replaces timelines, swimlanes, and bloated roadmap decks with a radial, astronomical metaphor that
        reflects how a product or organization grows capabilities over time, moving from nebulous ideas to concrete deliverables.
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
        or impact. They can either show when a capability meaningfully contributes to the North Star or when it ships.
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

      <h3 style={{ margin: "14px 0 6px" }}>Contours: Strategic Density &amp; Negative Space</h3>
      <ul>
        <li>Dense areas form the mass of investment.</li>
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
        <li>Clarity &gt; precision. Nebula is about direction, not scheduling.</li>
        <li>Negative space matters. Gaps are as important as planned work.</li>
      </ol>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-4" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>4. The Law of Simplicity (&quot;&lt; = &gt;&quot;)</h2>

      <p>
        Nebula is built on a communication philosophy: say the hard thing in the simplest way possible. This
        principle anchors the entire framework.
      </p>

      <h3 style={{ margin: "14px 0 6px" }}>4.1 Essence</h3>
      <p>
        A roadmap is only valuable if it is readable, interpretable, and memorable. Complexity destroys meaning.
        Nebula forces the discipline of focus:
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

      <p>Nebula works because it respects human cognition and rewards clarity.</p>
    </section>

    <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid rgba(0,0,0,0.08)" }} />

    <section id="gb-5" style={{ scrollMarginTop: 80 }}>
      <h2 style={{ margin: "6px 0 8px" }}>5. Tools for Adults: The No Child Locks Principle</h2>

      <p>
        Nebula tools must respect the intelligence and autonomy of the people using them. Inspired by the No
        Child Locks philosophy, the Nebula editor embraces guidance—not restriction.
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
      <p>Nebula only uses guardrails. Never child locks.</p>

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
      <p>The purpose of Nebula is alignment, not enforcement. Its canvas is a way to expose:</p>
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
        To make Nebula usable in a web app (instead of manual slide work), we treat the chart as data, not
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
        This separation (data model vs. rendering) is what makes the Nebula format implementable as a
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
            <div
  key={axis.id}
  className="nodeAxisGroup"
  style={{
    background: "var(--theme-panel-solid)",
    borderRadius: 14,
    padding: 10,
    border: "1px solid var(--theme-border)",

    boxShadow: `
      0 0 0 1px var(--theme-border) inset,
      0 0 18px color-mix(in srgb, var(--theme-accent) 22%, transparent),
      0 18px 40px rgba(0,0,0,0.18)
    `,
    backdropFilter: "blur(10px)",
  }}
>


              <div className="nodeAxisHeader">
                <div className="axisHeaderMain">
                                    {/* sequencing warnings removed — order is auto-managed */}


                  <input
  className="nodeAxisTitleInput"
  value={axis.label}
  onChange={(e) => updateAxisLabel(axis.id, e.target.value)}
  placeholder="Axis name"
  onClick={(e) => e.stopPropagation()}
  style={{ ...darkFieldStyle, padding: "8px 10px" }}
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
  style={darkTextareaStyle}
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
                        

                            return (
                              <div
  key={n.id}
  className={`nodeRow ${selectedNodeId === n.id ? "nodeRowSelected" : ""}`}
  ref={(el) => {
    nodeRowRefs.current[n.id] = el;
  }}
  onClick={() => {
  selectedNodeIdRef.current = n.id;
  setSelectedNodeId(n.id);
}}
  style={{
    cursor: "pointer",
    background: "var(--theme-panel-solid)",
    opacity: n.complete ? 0.72 : 1,

    borderRadius: 14,
    padding: 12,
    border: "1px solid var(--theme-border)",
    color: "var(--theme-text)",
    boxShadow: `
      0 0 0 1px var(--theme-border) inset,
      0 0 18px color-mix(in srgb, var(--theme-accent) 22%, transparent),
      0 18px 40px rgba(0,0,0,0.18)
    `,
    backdropFilter: "blur(10px)",
  }}
>

                                <div className="nodeMeta">
                                <div className="nodeLabel" style={{ color: "var(--theme-muted)", letterSpacing: 0.6 }}>
  Node
</div>

<input
  value={n.label ?? ""}
  onChange={(e) => {
    const nextLabel = e.target.value;
    setNodes((prev) => prev.map((x) => (x.id === n.id ? { ...x, label: nextLabel } : x)));
  }}
  style={{ ...darkFieldStyle, padding: "8px 10px" }}
/>


                                </div>

<div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
  <label className="viewToggle" style={{ margin: 0 }}>
    <input
      type="checkbox"
      checked={!!n.complete}
      onChange={(e) => {
        const on = e.target.checked;
        setNodes((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, complete: on } : x))
        );
      }}
    />
    <span>Complete</span>
  </label>

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
  style={{
    ...darkFieldStyle,
    width: 58,
    padding: "6px 8px",
    textAlign: "center",
  }}
  title="Wrap width (px)"
/>

</div>


                                <div className="nodeControls">
                                  <div className="nodeControl">
                                    <div className="nodeLabel" style={{ color: "var(--theme-muted)", letterSpacing: 0.6 }}>
  Ring
</div>

                                   <select
  value={n.ringId}
  onChange={(e) =>
    setNodes((prev) =>
      prev.map((x) =>
        x.id === n.id ? { ...x, ringId: e.target.value } : x
      )
    )
  }
  style={darkSelectStyle}
>

                                      {rings.map((rr) => (
                                        <option key={rr.id} value={rr.id}>
                                          {rr.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                                                  {/* Order UI removed — order is auto-derived from ring + position */}


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
        onChange={(e) => {
          setShareOpen(false);
          setShareStatus('');
          loadSnapshotById(e.target.value);
        }}
        style={{ minWidth: 180, flex: "1 1 240px" }}
        title="Select a saved strategy"
      >
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.access && s.access !== 'owner' ? ` · shared (${s.access})` : ''}
          </option>
        ))}
      </select>

      {activeSnapshotId && (
        <input
          value={snapshots.find((s) => s.id === activeSnapshotId)?.name ?? ""}
          onChange={(e) => renameSnapshot(activeSnapshotId, e.target.value)}
          disabled={activeAccess === 'view'}
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
        <span
          style={{ display: "inline-flex" }}
          title={activeAccess === 'view' ? "View-only access: use Save As to create your own editable copy." : "Save current strategy"}
        >
          <button
            className="smallBtn"
            onClick={() => saveCurrentSnapshot("manual")}
            disabled={!activeSnapshotId || activeAccess === 'view'}
            aria-label={activeAccess === 'view' ? "Save unavailable for view-only access" : "Save current strategy"}
          >
            Save
          </button>
        </span>

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
              const blank: NebulaSavedStateV1 = {
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
          title="Import a previously exported Nebula data file (JSON)"
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
          disabled={!activeSnapshotId || activeAccess !== 'owner'}
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
      {syncStatus && (
        <span
          role="status"
          className="muted"
          style={{
            width: syncStatus.startsWith("Editing paused") || syncStatus.startsWith("Access removed") ? "100%" : undefined,
            fontSize: 12,
          }}
        >
          {syncStatus}
        </span>
      )}
    </div>

    {/* Ownership + sharing */}
    <div
      style={{
        width: "100%",
        marginTop: 14,
        paddingTop: 12,
        borderTop: "1px solid rgba(128,128,128,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {activeAccess === 'owner' ? 'Owned by you' : `${activeAccess === 'edit' ? 'Can edit' : 'View only'} · Owned by ${activeOwnerEmail}`}
        </span>
        {activeSnapshotId && activeAccess === 'owner' && (
          <button
            type="button"
            className="smallBtn"
            onClick={() => {
              if (shareOpen) {
                setShareOpen(false);
                setShareStatus('');
              } else {
                void openSharing();
              }
            }}
          >
            {shareOpen ? 'Close sharing' : 'Share'}
          </button>
        )}
      </div>

      {shareOpen && activeAccess === 'owner' && (
        <div style={{ width: "100%", marginTop: 10, padding: 12, border: "1px solid rgba(128,128,128,0.28)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong>Share this Nebula</strong>
            <button type="button" className="smallBtn" onClick={() => void copyShareLink()}>Copy link</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="Email address" style={{ flex: "1 1 180px" }} />
            <select value={sharePermission} onChange={(e) => setSharePermission(e.target.value as 'view' | 'edit')}>
              <option value="view">Can view</option><option value="edit">Can edit</option>
            </select>
            <button type="button" className="smallBtn" disabled={!shareEmail.trim()} onClick={() => void addShare()}>Share</button>
          </div>
          {shares.map((share) => (
            <div key={share.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <span style={{ flex: 1, fontSize: 12 }}>{share.email}</span><span className="muted" style={{ fontSize: 12 }}>{share.permission === 'edit' ? 'Can edit' : 'Can view'}</span>
              <button type="button" className="smallBtn" onClick={() => void removeShare(share.id)}>Remove</button>
            </div>
          ))}
          <div role="status" className="muted" style={{ fontSize: 12, marginTop: shareStatus ? 8 : 0 }}>{shareStatus}</div>
        </div>
      )}
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

          <label
            className="themePicker presentationThemePicker"
            title="Choose your personal visual theme"
          >
            <span aria-hidden="true">{theme.icon}</span>
            <select
              aria-label="Visual theme"
              value={themeId}
              onChange={(event) => chooseTheme(event.target.value as ThemeId)}
            >
              {THEME_ORDER.map((id) => (
                <option key={id} value={id}>{THEMES[id].label}</option>
              ))}
            </select>
          </label>

          
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
                          style={ringToggleBtnStyle(showNowBlob, RING_BLOB_FILLS.now)}
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
                          style={ringToggleBtnStyle(showNextBlob, RING_BLOB_FILLS.next)}
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
                          style={ringToggleBtnStyle(showLaterBlob, RING_BLOB_FILLS.later)}
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
                      style={ringMasterBtnStyle(showNodes && showNodeLabels)}
                      onClick={() => setShowNodeLabels((v) => !v)}
                      title="Toggle labels"
                    >
                      Labels
                    </button>

                    <button
                      type="button"
                      style={ringMasterBtnStyle(showNodes)}
                      onClick={() =>
                        setShowNodes((prev) => {
                          const next = !prev;
                          if (!next) setShowNodeLabels(false);
                          return next;
                        })
                      }
                      title="Toggle nodes"
                    >
                      Nodes
                    </button>

                    <button
                      type="button"
                      style={ringMasterBtnStyle(hideCompleted)}
                      onClick={() => setHideCompleted((v) => !v)}
                      title="Hide completed items (nodes + labels) on the chart"
                    >
                      Hide Complete
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
                    style={ringToggleBtnStyle(showNowBlob, RING_BLOB_FILLS.now)}
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
                    style={ringToggleBtnStyle(showNextBlob, RING_BLOB_FILLS.next)}
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
                    style={ringToggleBtnStyle(showLaterBlob, RING_BLOB_FILLS.later)}
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
                style={ringMasterBtnStyle(showNodes && showNodeLabels)}
                onClick={() => setShowNodeLabels((v) => !v)}
                title="Toggle labels"
              >
                Labels
              </button>

              <button
                type="button"
                style={ringMasterBtnStyle(showNodes)}
                onClick={() =>
                  setShowNodes((prev) => {
                    const next = !prev;
                    if (!next) setShowNodeLabels(false);
                    return next;
                  })
                }
                title="Toggle nodes"
              >
                Nodes
              </button>

              <button
                type="button"
                style={ringMasterBtnStyle(hideCompleted)}
                onClick={() => setHideCompleted((v) => !v)}
                title="Hide completed items (nodes + labels) on the chart"
              >
                Hide Complete
              </button>

            </div>


          </div>
        </div>
      </div>
    )}


    {/* CANVAS COLUMN (always present) */}
    <div className="canvasStageCol">

      {(() => {

              const size = measuredStageSize;

              // combine refs: we need the div measured AND stageRef for tooltip positioning
              const setStageEl = (el: HTMLDivElement | null) => {
                stageRef.current = el;
                (measuredStageRef as any).current = el;
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

// ✅ Chart behavior:
// - Blob geometry should ALWAYS be computed from ALL nodes (so the shape is stable).
// - Hide Complete should ONLY affect rendering of dots + labels (presentation), not the blob math.
const blobNodes = nodes;
const visibleNodes = hideCompleted ? nodes.filter((n) => !n.complete) : nodes;




              // -------------------- Drag helpers (inside SVG sizing scope) --------------------
const ringRadiusByIdBase: Record<string, number> = {
  now: ringNow,
  next: ringNext,
  later: ringLater,
};

const DRAG_MAX_R = ringLater - 10; // keep inside outer circle

// -------------------- Auto-sequence (single source of truth) --------------------
// We keep `sequence` in the model for deterministic exports + ordering,
// but we never ask the user to manage it directly.
const normalizeSeqForAxis = (draftNodes: NodeItem[], axisId: string) => {
  // ring order as displayed (Now=0, Next=1, Later=2, Uncommitted=last)
  const rankByRing = rings.reduce((acc, r, i) => {
    acc[r.id] = i;
    return acc;
  }, {} as Record<string, number>);

  const ringRadiusById: Record<string, number> = {
    now: ringNow,
    next: ringNext,
    later: ringLater,
    uncommitted: ringLater, // treat as outer band for ordering
  };

  // Back-compat + normalization (same rule you use elsewhere)
  const overrideToPx = (n: NodeItem) => {
    const v = n.rOverride;
    if (v == null || !Number.isFinite(v)) return null;
    return v <= 1.5 ? v * ringLater : v;
  };

  const axisNodes = draftNodes.filter((n) => n.axisId === axisId);

  // Sort by:
  // 1) ring rank (as defined by ring ordering)
  // 2) radial position if user nudged (or base ring radius if not)
  // 3) stable tie-breakers (existing sequence, then label)
  const ordered = axisNodes
    .slice()
    .sort((a, b) => {
      const ar = rankByRing[a.ringId] ?? 9999;
      const br = rankByRing[b.ringId] ?? 9999;
      if (ar !== br) return ar - br;

      const apx = overrideToPx(a) ?? ringRadiusById[a.ringId] ?? ringLater;
      const bpx = overrideToPx(b) ?? ringRadiusById[b.ringId] ?? ringLater;
      if (apx !== bpx) return apx - bpx;

      if ((a.sequence ?? 0) !== (b.sequence ?? 0)) return (a.sequence ?? 0) - (b.sequence ?? 0);
      return String(a.label ?? "").localeCompare(String(b.label ?? ""));
    });

  const nextSeqById = ordered.reduce((acc, n, i) => {
    acc[n.id] = i + 1;
    return acc;
  }, {} as Record<string, number>);

  return draftNodes.map((n) =>
    n.axisId === axisId ? { ...n, sequence: nextSeqById[n.id] ?? n.sequence } : n
  );
};


function clientToSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
  const svg = svgExportRef.current;
  const screenMatrix = svg?.getScreenCTM();
  if (!svg || !screenMatrix) return { x: cx2, y: cy2 };

  // Use the SVG's real screen transform instead of scaling against the
  // surrounding stage. The SVG uses preserveAspectRatio="xMidYMid meet",
  // so the stage can contain letterboxed space that would otherwise make a
  // node jump away from the pointer as soon as dragging begins.
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const svgPoint = point.matrixTransform(screenMatrix.inverse());

  return { x: svgPoint.x, y: svgPoint.y };
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
    // Only expand + scroll if the node is still selected
    // (prevents expanding/scrolling when user is deselecting)
if (selectedNodeIdRef.current === nodeId) {
  scrollLeftPaneToNode(nodeId);
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

    // Apply the move
    let draft = prev.map((x) =>
      x.id === nodeId
        ? {
            ...x,
            axisId: nextAxisId,
            ringId: nextRingId,
            rOverride: nextOverride,
          }
        : x
    );

    // Auto-sequence:
    // - Always normalize the destination axis
    // - If axis changed, normalize the source axis too
    draft = normalizeSeqForAxis(draft, nextAxisId);
    if (axisChanged) draft = normalizeSeqForAxis(draft, moving.axisId);

    return draft;
  });



  // Selection should follow the dragged node (but don’t scroll)
  expandAxis(nextAxisId);
  setSelectedNodeId(nodeId);

  didDragRef.current = false;
}



              const svgPointToClient = (x: number, y: number) => {
                const svg = svgExportRef.current;
                const screenMatrix = svg?.getScreenCTM();
                const stageRect = stageRef.current?.getBoundingClientRect();
                if (!svg || !screenMatrix || !stageRect) return { left: 0, top: 0 };

                const point = svg.createSVGPoint();
                point.x = x;
                point.y = y;
                const clientPoint = point.matrixTransform(screenMatrix);

                return {
                  left: clientPoint.x - stageRect.left,
                  top: clientPoint.y - stageRect.top,
                };
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
  {/* Space vignette */}
  <radialGradient id="spaceVignette" cx="50%" cy="50%" r="78%" gradientUnits="objectBoundingBox">
    <stop offset="0%" stopColor="#0B0A14" />
    <stop offset="55%" stopColor="#070710" />
    <stop offset="100%" stopColor="#04030A" />
  </radialGradient>

  {/* Tiny starfield pattern (crisp dots + a few soft ones) */}
  <pattern id="starsPattern" width="180" height="180" patternUnits="userSpaceOnUse">
    {/* crisp */}
    <circle cx="22" cy="26" r="1" fill="rgba(255,255,255,0.65)" />
    <circle cx="88" cy="54" r="1" fill="rgba(255,255,255,0.55)" />
    <circle cx="140" cy="32" r="1" fill="rgba(255,255,255,0.45)" />
    <circle cx="64" cy="118" r="1" fill="rgba(255,255,255,0.50)" />
    <circle cx="156" cy="132" r="1" fill="rgba(255,255,255,0.60)" />
    <circle cx="108" cy="156" r="1" fill="rgba(255,255,255,0.40)" />

    {/* a few “soft” stars */}
    <circle cx="36" cy="150" r="2" fill="rgba(255,255,255,0.14)" />
    <circle cx="168" cy="78" r="2" fill="rgba(255,255,255,0.12)" />
    <circle cx="92" cy="92" r="3" fill="rgba(255,255,255,0.08)" />
  </pattern>

  {/* Nebula haze overlay */}
  <radialGradient id="nebulaHaze" cx="50%" cy="50%" r="85%">
    <stop offset="0%" stopColor="rgba(255,79,160,0.08)" />
    <stop offset="45%" stopColor="rgba(157,88,255,0.07)" />
    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
  </radialGradient>

  {/* Soft glow for event-horizon ring */}
  <filter id="haloBlur" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="3.2" result="blur" />
  </filter>

  <linearGradient id="eventHorizonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stopColor="rgba(255,149,77,0.65)" />
    <stop offset="45%" stopColor="rgba(255,79,160,0.55)" />
    <stop offset="100%" stopColor="rgba(157,88,255,0.60)" />
  </linearGradient>

  {/* Light-theme field treatments */}
  <radialGradient id="islandWaterGrad" cx="42%" cy="35%" r="78%">
    <stop offset="0%" stopColor="#e8f9ff" />
    <stop offset="62%" stopColor="#d8f3fd" />
    <stop offset="100%" stopColor="#c8eaf6" />
  </radialGradient>

  <radialGradient id="pizzaCrustGrad" cx="42%" cy="35%" r="82%">
    <stop offset="0%" stopColor="#f8dda9" />
    <stop offset="68%" stopColor="#edc27f" />
    <stop offset="100%" stopColor="#dca45d" />
  </radialGradient>

  <radialGradient id="boardroomFieldGrad" cx="50%" cy="46%" r="72%">
    <stop offset="0%" stopColor="#ffffff" />
    <stop offset="62%" stopColor="#f4f7f9" />
    <stop offset="100%" stopColor="#dce3e8" />
  </radialGradient>

  <pattern id="crustSpeckles" width="54" height="54" patternUnits="userSpaceOnUse">
    <circle cx="8" cy="13" r="1.4" fill="#9b642f" opacity="0.16" />
    <circle cx="39" cy="9" r="0.9" fill="#8a5527" opacity="0.13" />
    <circle cx="23" cy="34" r="1.1" fill="#a66b31" opacity="0.14" />
    <circle cx="48" cy="43" r="1.7" fill="#8c5425" opacity="0.10" />
    <circle cx="5" cy="48" r="0.8" fill="#7f491f" opacity="0.12" />
  </pattern>


  {/* Clip so space only appears inside nebula field boundary */}
  <clipPath id="oceanClip">
    <circle cx={cx2} cy={cy2} r={ringLater} />
  </clipPath>
</defs>



  <g>
 {/* Space background (inside boundary) */}
<g clipPath="url(#oceanClip)">
  <rect
    x="0"
    y="0"
    width={w}
    height={h}
    fill={theme.id === "island" ? "url(#islandWaterGrad)" : theme.id === "pizza" ? "url(#pizzaCrustGrad)" : theme.id === "boardroom" ? "url(#boardroomFieldGrad)" : theme.chartBackground}
  />
  {theme.id === "pizza" && (
    <rect x="0" y="0" width={w} height={h} fill="url(#crustSpeckles)" />
  )}
  {theme.cosmic && (
    <>
      <rect x="0" y="0" width={w} height={h} fill="url(#spaceVignette)" />
      <rect x="0" y="0" width={w} height={h} fill="url(#starsPattern)" opacity={0.9} />
      <rect x="0" y="0" width={w} height={h} fill="url(#nebulaHaze)" opacity={1} />
    </>
  )}
</g>


{/* ✅ Blob geometry uses ALL nodes (stable shape). Rendering uses `visibleNodes`. */}


{/* --- Blobs (animated): cumulative per ring, tied to furthest DOT per axis --- */}
{(showNowBlob || showNextBlob || showLaterBlob) ? (
  <BlobLayer
    axes={axes}
    rings={rings}
    nodes={blobNodes}
    cx2={cx2}
    cy2={cy2}
    ringNow={ringNow}
    ringNext={ringNext}
    ringLater={ringLater}
    showNowBlob={showNowBlob}
    showNextBlob={showNextBlob}
    showLaterBlob={showLaterBlob}
    theme={theme}
  />
) : null}



{/* Event horizon outer ring */}
<g>
  {/* soft halo */}
  <circle
    cx={cx2}
    cy={cy2}
    r={ringLater}
    fill="none"
    stroke={theme.cosmic ? "url(#eventHorizonGrad)" : theme.boundaryColor}
    strokeWidth={10}
    opacity={theme.cosmic ? 0.22 : 0.16}
    filter="url(#haloBlur)"
  />
  {/* crisp rim */}
  <circle
    cx={cx2}
    cy={cy2}
    r={ringLater}
    fill="none"
    stroke={theme.boundaryColor}
    strokeWidth={1.25}
  />
</g>



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
                            <line x1={cx2} y1={cy2} x2={x2} y2={y2} stroke={theme.axisColor} strokeWidth={2} />


                            <text
                              x={lx + dx}
                              y={ly}
                              textAnchor={anchor}
                              dominantBaseline="middle"
                              fontSize="18"
                              fill={theme.chartText}
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
{/* Theme-specific center control (on top of axis lines) */}
{(() => {
  const iconR = theme.id === "nebula"
    ? Math.max(10, ringLater * 0.027)
    : Math.max(14, ringLater * 0.038);
  const iconScale = iconR / 32;

  return (
    <g
      role="button"
      aria-label={`Spin ${theme.label} center icon`}
      onClick={(e) => {
        e.stopPropagation();
        const dir = nebulaSpinDirRef.current;

        try {
          nebulaSpinAnimRef.current?.setAttribute("to", `${dir * 360} ${cx2} ${cy2}`);
          nebulaSpinAnimRef.current?.beginElement();
        } catch {
          // Ignore animation failures; the chart itself remains usable.
        }

        nebulaSpinDirRef.current = dir === 1 ? -1 : 1;
      }}
      style={{ cursor: "pointer" }}
    >
      <animateTransform
        ref={nebulaSpinAnimRef}
        attributeName="transform"
        type="rotate"
        from={`0 ${cx2} ${cy2}`}
        to={`360 ${cx2} ${cy2}`}
        dur="600ms"
        repeatCount="1"
        begin="indefinite"
      />

      <g transform={`translate(${cx2} ${cy2}) scale(${iconScale})`}>
        {theme.id === "nebula" && (
          <>
            <circle r="25" fill="rgba(157,88,255,0.10)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
            <circle r="15" fill="rgba(255,79,160,0.12)" />
            <path
              d="M 0 -28 C 2 -9 5 -4 25 0 C 5 4 2 9 0 28 C -2 9 -5 4 -25 0 C -5 -4 -2 -9 0 -28 Z"
              fill="#fffdf7"
              stroke="#ffd9f0"
              strokeWidth="1.2"
              style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.95)) drop-shadow(0 0 9px rgba(255,79,160,0.65))" }}
            />
            <circle r="3.5" fill="#ffffff" />
          </>
        )}

        {theme.id === "island" && (
          <image
            href={babyIslandImg}
            x="-46"
            y="-47"
            width="92"
            height="95"
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {theme.id === "pizza" && (
          <text
            x="0"
            y="2"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="56"
          >
            🍕
          </text>
        )}

        {theme.id === "halloween" && (
          <text
            x="0"
            y="2"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="56"
          >
            🎃
          </text>
        )}
      </g>
    </g>
  );
})()}

                      {/* Nodes */}
                      {showNodes &&
                      axes.map((axis) => {
                        const axisIndex = axes.findIndex((a) => a.id === axis.id);
                        if (axisIndex === -1) return null;

                        const angle = axisAngleOffset + (-Math.PI / 2 + (axisIndex * 2 * Math.PI) / axes.length);

                        const axisNodes = visibleNodes
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
const isComplete = !!n.complete;


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
const nextSelected = selectedNodeIdRef.current === n.id ? null : n.id;

// update ref immediately so pointerUp can read the right value
selectedNodeIdRef.current = nextSelected;

setSelectedNodeId(nextSelected);
if (nextSelected) expandAxis(n.axisId);


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
  r={isSelected ? theme.nodeRadius + 3 : theme.nodeRadius}
  opacity={isComplete ? 0.55 : 1}

  fill={
    isSelected
      ? theme.selectionFill
      : theme.nodeColor
        ? theme.nodeColor
      : (n.ringId === "uncommitted"
          ? theme.uncommittedNode
          : ((RING_COLORS[n.ringId] ? `${RING_COLORS[n.ringId]}CC` : theme.uncommittedNode)))
  }
  stroke={
    isSelected
      ? theme.selectionStroke
      : theme.nodeOutline
  }
  strokeWidth={isSelected ? 3 : 1.25}
  style={{
    filter: isSelected ? theme.selectionShadow : "none",
  }}
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
        fill={isSelected && theme.id === "nebula" ? theme.chartText : theme.nodeLabelColor}
        stroke={theme.nodeLabelStroke ?? "none"}
        strokeWidth={theme.nodeLabelStroke ? 2.4 : 0}
        paintOrder="stroke"

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
            stroke={theme.boundaryColor}
            strokeWidth={1}
          />

          {/* grab handle */}
          <rect
            x={textX + (n.wrapWidth ?? DEFAULT_NODE_WRAP_WIDTH) - 5}
            y={y - 6}
            width={10}
            height={12}
            rx={4}
            fill={theme.boundaryColor}
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
                        background: "rgba(12, 12, 22, 0.78)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 12,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: "rgba(245,247,255,0.92)",
                        boxShadow: "0 18px 46px rgba(0,0,0,0.45)",
                        backdropFilter: "blur(10px)",
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
                        border: "1px solid rgba(255,255,255,0.16)",
                        boxShadow: "0 18px 46px rgba(0,0,0,0.45)",
                        background: "rgba(12, 12, 22, 0.82)",
                        color: "rgba(245,247,255,0.92)",
                        backdropFilter: "blur(10px)",

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

export default function App() {
  const publicPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (publicPath === "/about") return <PublicPage kind="about" />;
  if (publicPath === "/privacy") return <PublicPage kind="privacy" />;
  if (publicPath === "/terms") return <PublicPage kind="terms" />;
  return <NebulaApp />;
}
