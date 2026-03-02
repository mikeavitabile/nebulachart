import React from "react";

type IslandNode = {
  id: string;
  label: string;
  axisKey: string; // which spoke / category
  value: number;   // 0..1
};

type Axis = {
  key: string;
  label: string;
  angleDeg: number;
};

function useSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
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

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg - 90) * (Math.PI / 180); // 0deg at top
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

export function BabyIslandChart({
  axes,
  nodes,
}: {
  axes: Axis[];
  nodes: IslandNode[];
}) {
  const { ref, size } = useSize<HTMLDivElement>();

  // ensures the circle never gets clipped in tall/wide states
  const minChartHeight = 720;

  const width = Math.max(1, size.width);
  const height = Math.max(minChartHeight, size.height || minChartHeight);

  const padding = 48;
  const cx = width / 2;
  const cy = height / 2;
  const radiusMax = Math.max(1, Math.min(width, height) / 2 - padding);

  const axisByKey = React.useMemo(() => {
    const m = new Map<string, Axis>();
    axes.forEach((a) => m.set(a.key, a));
    return m;
  }, [axes]);

  const projected = React.useMemo(() => {
    return nodes.map((n) => {
      const axis = axisByKey.get(n.axisKey);
      const angleDeg = axis?.angleDeg ?? 0;
      const v = Math.max(0, Math.min(1, n.value));
      const r = v * radiusMax;
      const { x, y } = polarToCartesian(cx, cy, r, angleDeg);
      return { ...n, x, y };
    });
  }, [nodes, axisByKey, cx, cy, radiusMax]);

  const [hoverId, setHoverId] = React.useState<string | null>(null);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* rings */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <circle
            key={t}
            cx={cx}
            cy={cy}
            r={t * radiusMax}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
          />
        ))}

        {/* axes */}
        {axes.map((a) => {
          const end = polarToCartesian(cx, cy, radiusMax, a.angleDeg);
          return (
            <line
              key={a.key}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.10)"
            />
          );
        })}

        {/* nodes */}
        {projected.map((n) => {
          const isHover = hoverId === n.id;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={isHover ? 8 : 6}
                fill={isHover ? "rgba(0,255,170,0.95)" : "rgba(0,255,170,0.65)"}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={1}
              />
              {isHover && (
                <text
                  x={n.x + 10}
                  y={n.y - 10}
                  fontSize={12}
                  fill="rgba(255,255,255,0.9)"
                >
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
