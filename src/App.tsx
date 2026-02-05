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

  const dotRadiusForNodeOnAxis = (axisNodesOrdered: NodeItem[], n: NodeItem) => {
    const baseR = ringRadiusById[n.ringId] ?? ringLater;

    const ringList = axisNodesOrdered.filter((x) => x.ringId === n.ringId);
    const idx = ringList.findIndex((x) => x.id === n.id);
    const k = ringList.length;

    const offset = k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread; // -spread..+spread
    return baseR + offset;
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

      return Math.max(...eligible.map((n) => dotRadiusForNodeOnAxis(axisNodesOrdered, n)));
    });
  };

  const radiiToPath = (radii: number[], tension = 1) => {
    const pts = radii.map((r, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
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
  }, [axes, nodes, rings]);

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
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const nodeRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showNodes, setShowNodes] = useState(true);
  const [nodeTooltip, setNodeTooltip] = useState<{ x: number; y: number; text: string } | null>(
    null
  );
  const [showNowBlob, setShowNowBlob] = useState(true);
  const [showNextBlob, setShowNextBlob] = useState(true);
  const [showLaterBlob, setShowLaterBlob] = useState(true);
  const [snapshots, setSnapshots] = useState<BabyIslandSnapshotV1[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

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


  // --- One-time init: load snapshots, import legacy if present, pick active via URL/localStorage ---
  useLayoutEffect(() => {
    try {
      let existing = readSnapshots();

      // Import legacy single-save once, if snapshots are empty
      if (existing.length === 0) {
        const legacy = safeParseJSON<BabyIslandSavedStateV1>(
          localStorage.getItem(LEGACY_STORAGE_KEY)
        );
        if (legacy && legacy.v === 1) {
          const now = Date.now();
          const imported: BabyIslandSnapshotV1 = {
            id: uid(),
            name: "Imported",
            createdAt: now,
            updatedAt: now,
            state: legacy,
          };
          existing.unshift(imported);

          try {
            writeSnapshots(existing);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          } catch {}
        }
      }

      // ✅ migrate old snapshots so rings include "uncommitted"
const migrated = migrateSnapshotsAddUncommitted(existing);
existing = migrated.next;

if (migrated.changed) {
  try {
    writeSnapshots(existing);
  } catch {}
}

setSnapshots(existing);


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
      } else {
        // No snapshots exist yet: create the first one from defaults
        // (but only after state hooks exist—this runs after first render; safe)
        // We'll create it lazily after initial state is available:
        // - we set working state to defaults (already)
        // - then createSnapshot in the next frame
        requestAnimationFrame(() => {
          createSnapshot("Strategy A", true);
        });
      }
    } catch (e) {
      console.warn("Init failed:", e);
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
    <div className="appShell">
       <header className="header">
        <strong>babyisland.dev</strong>
        <span className="muted">Workshop Tool v0</span>

        <div style={{ marginLeft: "auto" }}>
          <button
            className="smallBtn"
            onClick={() => setLeftCollapsed((v) => !v)}
            title={leftCollapsed ? "Show the left panel" : "Collapse the left panel"}
          >
            {leftCollapsed ? "Show panel" : "Collapse panel"}
          </button>
        </div>
      </header>


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

         <aside className="leftPanel">
  

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
      onClick={() => setNodesOpen((v) => !v)}
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

                      const lastNode = axisNodesOrdered[axisNodesOrdered.length - 1];
                      const lastCommittedRingId =
                        axisNodesOrdered
                          .slice()
                          .reverse()
                          .find((x) => x.ringId !== "uncommitted")?.ringId ?? "later";

                      const defaultRingId = lastNode ? lastNode.ringId : lastCommittedRingId;

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
                        },
                      ]);

                      setSelectedNodeId(newId);

                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          const el = nodeRowRefs.current[newId];
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        });
                      });
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

    </div>

    {/* Action buttons */}
    <div
      style={{
        display: "flex",
        gap: 8,
        marginTop: 10,
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


</aside>

        <main className="rightPanel">
          <div className="canvasPlaceholder" style={{ position: "relative" }}>
            <div className="canvasHeader">
              <div>
                <div className="title">{title}</div>
                <div className="subtitle">{subtitle}</div>

                {/* Controls (compact, in-flow) */}
                <div className="viewBar">
                  <label className="viewToggle" style={{ fontWeight: 800, letterSpacing: 0.2 }}>
                    <input
                      type="checkbox"
                      checked={showNowBlob && showNextBlob && showLaterBlob}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShowNowBlob(next);
                        setShowNextBlob(next);
                        setShowLaterBlob(next);
                      }}
                    />
                    <span>Rings</span>
                  </label>

<label className="viewToggle">
  <input
    type="checkbox"
    checked={showNowBlob}
    onChange={(e) => {
      const next = e.target.checked;
      setShowNowBlob(next);
      if (!next) {
        // If Now turns off, Next/Later can't remain on (cumulative)
        setShowNextBlob(false);
        setShowLaterBlob(false);
      }
    }}
  />
  <span>{rings.find((r) => r.id === "now")?.label ?? "Now"}</span>
</label>





                  <label className="viewToggle">
                    <input
                      type="checkbox"
                      checked={showNextBlob}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShowNextBlob(next);
                        if (next) {
                          setShowNowBlob(true);
                        } else {
                          setShowLaterBlob(false);
                        }
                      }}
                    />
                    <span>{rings.find((r) => r.id === "next")?.label ?? "Next"}</span>
                  </label>

                  <label className="viewToggle">
                    <input
                      type="checkbox"
                      checked={showLaterBlob}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setShowLaterBlob(next);
                        if (next) {
                          setShowNextBlob(true);
                          setShowNowBlob(true);
                        }
                      }}
                    />
                    <span>{rings.find((r) => r.id === "later")?.label ?? "Later"}</span>
                  </label>

                  <span style={{ width: 10 }} />

                  <label className="viewToggle" style={{ fontWeight: 800, letterSpacing: 0.2 }}>
                    <input
                      type="checkbox"
                      checked={showNodeLabels}
                      onChange={(e) => setShowNodeLabels(e.target.checked)}
                    />
                    <span>Labels</span>
                  </label>
                  

<label className="viewToggle">
  <input
    type="checkbox"
    checked={showNodes}
    onChange={(e) => setShowNodes(e.target.checked)}
  />
  <span>Nodes</span>
</label>


                </div>
              </div>
            </div>


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



              return (
                <div className="svgStage" ref={setStageEl}>
                  <svg
  style={{ fontFamily: '"Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}
  width="100%"
  height="100%"
  viewBox={`0 0 ${w} ${h}`}
  preserveAspectRatio="xMidYMid meet"
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
                        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;

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
                              style={{ cursor: "help", userSelect: "none", fontWeight: 500 }}
                              onMouseEnter={(e) => {
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                setTooltip({
                                  x: e.clientX - rect.left + 12,
                                  y: e.clientY - rect.top + 12,
                                  text: a.northStar,
                                });
                              }}
                              onMouseMove={(e) => {
                                const rect = stageRef.current?.getBoundingClientRect();
                                if (!rect) return;
                                setTooltip((prev) =>
                                  prev ? { ...prev, x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 } : prev
                                );
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

      <image
        href={babyImg}
        x={cx2 - babyR}
        y={cy2 - babyR}
        width={babyR * 2}
        height={babyR * 2}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#babyClip)"
      />
    </>
  );
})()}

                      {/* Nodes */}
                      {showNodes &&
                      axes.map((axis) => {
                        const axisIndex = axes.findIndex((a) => a.id === axis.id);
                        if (axisIndex === -1) return null;

                        const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / axes.length;

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

// Compute the furthest committed DOT radius on this axis (excluding uncommitted)
// If none exist, midpoint should be between center and edge (ringLater / 2)
const committedNodes = axisNodes.filter((n) => n.ringId !== "uncommitted");

const committedMaxRawR =
  committedNodes.length === 0
    ? 0
    : Math.max(
        ...committedNodes.map((cn) => {
          const base = ringRadiusById[cn.ringId] ?? ringLater;

          const ringList = nodesByRing[cn.ringId] ?? [];
          const idx = ringList.findIndex((x) => x.id === cn.id);
          const k = ringList.length;

          const offset =
            k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread; // -spread .. +spread

          return base + offset;
        })
      );

// Uncommitted should be equidistant from the edge and the last committed dot on this axis.
// If no committed dots: equidistant between center and edge.
const uncommittedMidR =
  committedNodes.length === 0 ? ringLater / 2 : (committedMaxRawR + ringLater) / 2;

return axisNodes.map((n) => {
  const baseR =
    n.ringId === "uncommitted"
      ? uncommittedMidR
      : (ringRadiusById[n.ringId] ?? ringLater);

  const ringList = nodesByRing[n.ringId] ?? [];
  const idx = ringList.findIndex((x) => x.id === n.id);
  const k = ringList.length;

  // spread +/- 18px around the ring so multiple nodes don't overlap
  const offset =
    k <= 1 ? 0 : ((idx / (k - 1)) * 2 - 1) * spread; // -spread .. +spread

  const rawR = baseR + offset;

  // Never allow dots to go outside the outer ring
  const maxR = ringLater - 10; // small padding so it's clearly inside the circle
  const r = Math.min(rawR, maxR);




                          const x = cx2 + r * Math.cos(angle);
                          const y = cy2 + r * Math.sin(angle);

                          const isSelected = selectedNodeId === n.id;

                          return (
                            <g
                              key={n.id}
                              onClick={() => {
  expandAxis(n.axisId);
  setSelectedNodeId(n.id);
  const el = nodeRowRefs.current[n.id];
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
                              />

                              {showNodeLabels && (
                                <text
                                  x={x + 12}
                                  y={y}
                                  dominantBaseline="middle"
                                  fontSize="13"
                                  fill={isSelected ? "#111" : "#333"}
                                  style={{ fontWeight: isSelected ? 600 : 300 }}
                                >
                                  {n.label}
                                </text>
                              )}
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
                </div>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}
