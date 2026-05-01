import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import "./App.css";

const GOOGLE_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTc1VtbNHQARWS48OdifG6WKlKkHZHamE1482aRWixKdVS9D_oom1wfKmJ3dlhXkWh1vDt-4e8tcc7O/pub?gid=1657141867&single=true&output=csv";

const STAGES = [
  "Raw data",
  "QC",
  "Assembly",
  "Taxonomy",
  "Annotation",
  "Phylogeny",
  "Characterisation",
  "Other",
];

const LANES = [
  { name: "All", icon: "🧬", label: "All tools" },
  { name: "General", icon: "⚙️", label: "General" },
  { name: "Phage", icon: "🦠", label: "Phage" },
  { name: "Bacteria", icon: "🧫", label: "Bacteria" },
  { name: "Metagenome", icon: "🌍", label: "Metagenome" },
  { name: "Microbiome", icon: "🧪", label: "Microbiome" },
];

function detectStage(tool) {
  const text = `${tool.Category} ${tool.Usage} ${tool.Description}`.toLowerCase();

  if (text.includes("quality") || text.includes("qc") || text.includes("trim")) return "QC";
  if (text.includes("assembl")) return "Assembly";
  if (text.includes("taxonom") || text.includes("classification")) return "Taxonomy";
  if (text.includes("annot")) return "Annotation";
  if (text.includes("phylog") || text.includes("tree")) return "Phylogeny";
  if (text.includes("character") || text.includes("amr") || text.includes("resistance")) return "Characterisation";
  if (text.includes("raw") || text.includes("fastq")) return "Raw data";

  return "Other";
}

function detectLane(tool) {
  const text = `${tool.Category} ${tool.Usage} ${tool.Description}`.toLowerCase();

  if (text.includes("phage") || text.includes("viral") || text.includes("virus")) return "Phage";
  if (text.includes("metagenome") || text.includes("metagenomic")) return "Metagenome";
  if (text.includes("microbiome")) return "Microbiome";
  if (text.includes("bacteria") || text.includes("bacterial")) return "Bacteria";

  return "General";
}

export default function App() {
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("All");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch(GOOGLE_SHEET_CSV_URL)
      .then((res) => res.text())
      .then((csv) => {
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const cleaned = result.data
              .filter((row) => row.Name)
              .map((row) => ({
                ...row,
                Stage: detectStage(row),
                Lane: detectLane(row),
              }));
            setTools(cleaned);
          },
        });
      })
      .catch((err) => console.error("Sheet loading error:", err));
  }, []);

  const lanes = LANES;

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const text = `
        ${tool.Name}
        ${tool.Version}
        ${tool.Status}
        ${tool.Category}
        ${tool.Usage}
        ${tool.Description}
        ${tool.Installed_on}
        ${tool.Call_tool}
        ${tool.URL}
        ${tool.Citation}
      `.toLowerCase();

      return text.includes(query.toLowerCase()) && (lane === "All" || tool.Lane === lane);
    });
  }, [tools, query, lane]);

  const grouped = STAGES.map((stage) => ({
    stage,
    tools: filteredTools.filter((tool) => tool.Stage === stage),
  }));

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">VEO Bioinformatics Tool Atlas</p>
          <h1>Workflow-based interactive tool navigator</h1>
          <p>
            Tools are loaded automatically from Google Sheets and organised into
            workflow stages.
          </p>
        </div>

        <div className="summary">
          <strong>{tools.length}</strong>
          <span>tools</span>
        </div>
      </header>

      <section className="lane-cards">
        {lanes.map((item) => (
          <button
            key={item.name}
            className={`lane-card lane-${item.name.toLowerCase()} ${lane === item.name ? "active" : ""}`}
            onClick={() => setLane(item.name)}
          >
            <span className="lane-icon">{item.icon}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </section>

      <section className="controls">
        <input
          placeholder="Search tools, usage, category, command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <select value={lane} onChange={(e) => setLane(e.target.value)}>
          {lanes.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </section>

      <section className="workflow">
        {grouped.map((group) => (
          <div className="stage" key={group.stage}>
            <h2>{group.stage}</h2>

            <div className="nodes">
              {group.tools.slice(0, 25).map((tool, index) => (
                <button
                  className={`node ${tool.Lane.toLowerCase()}`}
                  key={`${tool.Name}-${index}`}
                  onClick={() => setSelected(tool)}
                >
                  <strong>{tool.Name}</strong>
                  <small>{tool.Usage || tool.Category}</small>
                </button>
              ))}

              {group.tools.length > 25 && (
                <div className="more">+{group.tools.length - 25} more</div>
              )}
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <aside className="drawer">
          <button className="close" onClick={() => setSelected(null)}>
            ×
          </button>

          <h2>{selected.Name}</h2>
          <p className="badge">{selected.Lane}</p>

          <p>{selected.Description}</p>

          <dl>
            <dt>Version</dt>
            <dd>{selected.Version || "NA"}</dd>

            <dt>Status</dt>
            <dd>{selected.Status || "NA"}</dd>

            <dt>Category</dt>
            <dd>{selected.Category || "NA"}</dd>

            <dt>Usage</dt>
            <dd>{selected.Usage || "NA"}</dd>

            <dt>Installed on</dt>
            <dd>{selected.Installed_on || "NA"}</dd>
          </dl>

          {selected.Call_tool && (
            <>
              <h3>Draco command</h3>
              <pre>{selected.Call_tool}</pre>
            </>
          )}

          {selected.URL && (
            <a href={selected.URL} target="_blank" rel="noreferrer">
              Open tool website →
            </a>
          )}

          {selected.Citation && <p className="citation">{selected.Citation}</p>}
        </aside>
      )}
    </main>
  );
}