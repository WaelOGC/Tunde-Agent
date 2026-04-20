import { useMemo } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import { Bar, Line, Pie, Scatter } from "react-chartjs-2";

ChartJS.register(...registerables);

const THEME_COLORS = {
  purple: { stroke: "rgb(99, 102, 241)", fill: "rgba(99, 102, 241, 0.38)" },
  blue: { stroke: "rgb(59, 130, 246)", fill: "rgba(59, 130, 246, 0.38)" },
  green: { stroke: "rgb(34, 197, 94)", fill: "rgba(34, 197, 94, 0.38)" },
  orange: { stroke: "rgb(249, 115, 22)", fill: "rgba(249, 115, 22, 0.38)" },
};

/** Convert category labels + numeric series to Chart.js scatter points (x = index 1..n). */
export function toScatterData(labels, data) {
  const labs = Array.isArray(labels) ? labels : [];
  const nums = Array.isArray(data) ? data : [];
  const n = Math.min(labs.length, nums.length);
  return Array.from({ length: n }, (_, i) => ({
    x: i + 1,
    y: typeof nums[i] === "number" && !Number.isNaN(nums[i]) ? nums[i] : Number(nums[i]) || 0,
  }));
}

const THEME_HUES = { purple: 250, blue: 217, green: 142, orange: 25 };

function themeSliceColors(themeKey, count) {
  const hue = THEME_HUES[themeKey] ?? THEME_HUES.purple;
  return Array.from({ length: count }, (_, i) => {
    const h = (hue + i * 32) % 360;
    return `hsla(${h}, 72%, ${58 - (i % 4) * 5}%, 0.88)`;
  });
}

export function chartDataSupportsScatter(chartData) {
  const d0 = chartData?.datasets?.[0]?.data;
  if (!Array.isArray(d0) || !d0.length) return false;
  const el = d0[0];
  return (
    typeof el === "object" &&
    el !== null &&
    !Array.isArray(el) &&
    typeof el.x === "number" &&
    typeof el.y === "number"
  );
}

/** True if we can build a scatter from labels + a numeric first series. */
export function chartDataScatterConvertible(chartData) {
  if (chartDataSupportsScatter(chartData)) return true;
  const labels = chartData?.labels;
  const d0 = chartData?.datasets?.[0]?.data;
  if (!Array.isArray(labels) || !labels.length || !Array.isArray(d0) || !d0.length) return false;
  const n = Math.min(labels.length, d0.length);
  if (n < 2) return false;
  let numeric = 0;
  for (let i = 0; i < n; i += 1) {
    const v = d0[i];
    if (typeof v === "number" && !Number.isNaN(v)) numeric += 1;
    else if (v != null && v !== "" && !Number.isNaN(Number(v))) numeric += 1;
  }
  return numeric >= 2;
}

function buildChartJsData(chartData, chartType, themeKey) {
  const raw = chartData && typeof chartData === "object" ? chartData : {};
  const labels = Array.isArray(raw.labels) ? raw.labels : [];
  const datasetsIn = Array.isArray(raw.datasets) ? raw.datasets : [];
  const theme = THEME_COLORS[themeKey] || THEME_COLORS.purple;

  if (!datasetsIn.length) return null;

  if (chartType === "pie") {
    const ds0 = datasetsIn[0];
    const nums = Array.isArray(ds0?.data) ? ds0.data.map((v) => Number(v) || 0) : [];
    const pieLabels = labels.length === nums.length ? labels : nums.map((_, i) => `Item ${i + 1}`);
    const sliceColors = themeSliceColors(themeKey, nums.length || 1);
    return {
      labels: pieLabels.slice(0, nums.length),
      datasets: [
        {
          label: typeof ds0?.label === "string" ? ds0.label : "Values",
          data: nums,
          backgroundColor: sliceColors,
          borderColor: "rgba(15, 23, 42, 0.55)",
          borderWidth: 1,
        },
      ],
    };
  }

  if (chartType === "scatter") {
    if (chartDataSupportsScatter(raw)) {
      return {
        datasets: datasetsIn.map((ds, i) => {
          const stroke = i === 0 ? theme.stroke : themedDatasetStroke(themeKey, i);
          const fill = i === 0 ? theme.fill : hslStrokeToFill(stroke, 0.38);
          return {
            label: typeof ds.label === "string" ? ds.label : `Series ${i + 1}`,
            data: Array.isArray(ds.data) ? ds.data : [],
            borderColor: stroke,
            backgroundColor: fill,
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          };
        }),
      };
    }
    if (chartDataScatterConvertible(raw)) {
      const ds0 = datasetsIn[0];
      const nums = Array.isArray(ds0?.data) ? ds0.data : [];
      const pts = toScatterData(labels, nums);
      return {
        datasets: [
          {
            label: typeof ds0?.label === "string" ? ds0.label : "Series",
            data: pts,
            borderColor: theme.stroke,
            backgroundColor: theme.fill,
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      };
    }
    return null;
  }

  return {
    labels,
    datasets: datasetsIn.map((ds, i) => {
      const stroke = themedDatasetStroke(themeKey, i);
      const fill =
        chartType === "line" ? hslStrokeToFill(stroke, 0.22) : hslStrokeToFill(stroke, 0.36);
      const nums = Array.isArray(ds.data)
        ? ds.data.map((v) => (typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0))
        : [];
      return {
        label: typeof ds.label === "string" ? ds.label : `Series ${i + 1}`,
        data: nums,
        borderColor: stroke,
        backgroundColor: chartType === "line" ? fill : fill,
        tension: chartType === "line" ? 0.25 : 0,
        fill: chartType === "line",
      };
    }),
  };
}

function themedDatasetStroke(themeKey, index) {
  const hue = THEME_HUES[themeKey] ?? THEME_HUES.purple;
  const h = (hue + index * 22) % 360;
  const light = Math.max(44, 62 - index * 7);
  return `hsl(${h}, 72%, ${light}%)`;
}

function hslStrokeToFill(stroke, alpha) {
  if (!String(stroke).startsWith("hsl(")) return stroke;
  return String(stroke).replace(/\)$/, `, ${alpha})`).replace(/^hsl\(/, "hsla(");
}

export default function DataChart({ chartData, chartType, colorTheme = "purple" }) {
  const effectiveChartType = useMemo(() => {
    if (chartType !== "scatter") return chartType;
    if (chartDataSupportsScatter(chartData) || chartDataScatterConvertible(chartData)) return "scatter";
    return "bar";
  }, [chartType, chartData]);

  const built = useMemo(
    () => buildChartJsData(chartData, effectiveChartType, colorTheme),
    [chartData, effectiveChartType, colorTheme]
  );

  const options = useMemo(() => {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", font: { size: 11 } },
        },
        tooltip: {
          titleColor: "#f1f5f9",
          bodyColor: "#e2e8f0",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "rgba(148, 163, 184, 0.35)",
          borderWidth: 1,
        },
      },
    };
    if (chartType === "pie") {
      return { ...base, scales: {} };
    }
    if (chartType === "scatter") {
      return {
        ...base,
        scales: {
          x: {
            type: "linear",
            position: "bottom",
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(148, 163, 184, 0.12)" },
          },
          y: {
            type: "linear",
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(148, 163, 184, 0.12)" },
          },
        },
      };
    }
    return {
      ...base,
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxRotation: 45 },
          grid: { color: "rgba(148, 163, 184, 0.12)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.12)" },
        },
      },
    };
  }, [effectiveChartType]);

  const chartKey = `${colorTheme}-${effectiveChartType}-${JSON.stringify(chartData?.datasets?.[0]?.data ?? []).slice(0, 80)}`;

  if (!built || !built.datasets?.length) {
    return (
      <p className="rounded-lg border border-cyan-900/35 bg-slate-950/40 px-3 py-2 text-[12px] text-slate-500">
        No chartable numeric series in this result.
      </p>
    );
  }

  if (effectiveChartType === "pie") {
    return (
      <div key={chartKey} className="mx-auto h-64 w-full min-w-0 max-w-md">
        <Pie data={built} options={options} />
      </div>
    );
  }
  if (effectiveChartType === "scatter") {
    return (
      <div key={chartKey} className="h-64 w-full min-w-0">
        <Scatter data={built} options={options} />
      </div>
    );
  }
  if (effectiveChartType === "line") {
    return (
      <div key={chartKey} className="h-64 w-full min-w-0">
        <Line data={built} options={options} />
      </div>
    );
  }
  return (
    <div key={chartKey} className="h-64 w-full min-w-0">
      <Bar data={built} options={options} />
    </div>
  );
}
