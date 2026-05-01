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
  { name: "Bacteria", icon: "🧫", label: "Bacteria" },
  { name: "Phage", icon: "🦠", label: "Phage" },
  { name: "Metagenome", icon: "🌍", label: "Metagenome" },
  { name: "Microbiome", icon: "🧪", label: "Microbiome" },
  { name: "Virome", icon: "🧬", label: "Virome" },
];

const CATEGORY_MAP = {
  bacteria: "Bacteria",
  phage: "Phage",
  metagenome: "Metagenome",
  microbiome: "Microbiome",
  virome: "Virome",
  other: "Other",
};

function getSheetCsvUrl() {
  const url = new URL(GOOGLE_SHEET_CSV_URL);
  url.searchParams.set("ts", Date.now().toString());
  return url.toString();
}

function getFunctionalCategory(tool) {
  return tool.FunctionalCategory || tool.Functional_Category || tool.Usage || "";
}

function getCategory(tool) {
  return tool.Category || tool.Domain_Category || "";
}

function copyText(text) {
  if (!text) return Promise.resolve(false);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve(copied);
}

function getToolSearchText(tool) {
  return `
    ${tool.Name}
    ${tool.Version}
    ${tool.Status}
    ${getCategory(tool)}
    ${getFunctionalCategory(tool)}
    ${tool.Description}
    ${tool.Installed_on}
    ${tool.Call_tool}
    ${tool.URL}
    ${tool.Citation}
  `.toLowerCase();
}

function detectStage(tool) {
  const text = `${getCategory(tool)} ${getFunctionalCategory(tool)} ${tool.Description}`.toLowerCase();

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
  const categoryParts = getCategory(tool)
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const lanes = categoryParts
    .map((part) => CATEGORY_MAP[part])
    .filter(Boolean);

  if (lanes.length === 0) return ["Other"];

  return [...new Set(lanes)];
}

export default function App() {
  const [tools, setTools] = useState([]);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("All");
  const [selectedToolKey, setSelectedToolKey] = useState(null);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [commandCopied, setCommandCopied] = useState(false);

  useEffect(() => {
    fetch(getSheetCsvUrl(), { cache: "no-store" })
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
                Lanes: detectLane(row),
              }));
            setTools(cleaned);
          },
        });
      })
      .catch((err) => console.error("Sheet loading error:", err));
  }, []);

  const lanes = LANES;

  const toolGroups = useMemo(() => {
    const groups = new Map();

    tools.forEach((tool) => {
      const key = (tool.Name || "").trim().toLowerCase();
      if (!key) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: (tool.Name || "NA").trim(),
          stage: tool.Stage || "Other",
          versions: [tool],
          lanes: new Set(tool.Lanes || ["Other"]),
          searchText: getToolSearchText(tool),
        });
        return;
      }

      const existing = groups.get(key);
      (tool.Lanes || ["Other"]).forEach((item) => existing.lanes.add(item));
      existing.searchText += ` ${getToolSearchText(tool)}`;
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      lanes: [...group.lanes],
    }));
  }, [tools]);

  const filteredGroups = useMemo(() => {
    const loweredQuery = query.toLowerCase();

    return toolGroups.filter((group) => {
      return group.searchText.includes(loweredQuery) && (lane === "All" || group.lanes.includes(lane));
    });
  }, [toolGroups, query, lane]);

  const grouped = STAGES.map((stage) => ({
    stage,
    tools: filteredGroups.filter((group) => group.stage === stage),
  }));

  const selectedGroup = useMemo(() => {
    if (!selectedToolKey) return null;
    return toolGroups.find((group) => group.key === selectedToolKey) || null;
  }, [toolGroups, selectedToolKey]);

  const selectedTool = selectedGroup ? selectedGroup.versions[selectedVersionIndex] || selectedGroup.versions[0] : null;

  useEffect(() => {
    if (selectedGroup && selectedVersionIndex >= selectedGroup.versions.length) {
      setSelectedVersionIndex(0);
    }
  }, [selectedGroup, selectedVersionIndex]);

  useEffect(() => {
    setCommandCopied(false);
  }, [selectedToolKey, selectedVersionIndex]);

  const handleCopyCommand = async () => {
    if (!selectedTool || !selectedTool.Call_tool) return;
    const copied = await copyText(selectedTool.Call_tool);
    if (!copied) return;

    setCommandCopied(true);
    window.setTimeout(() => setCommandCopied(false), 1800);
  };

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
          <strong>{toolGroups.length}</strong>
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
          placeholder="Search tools, functional category, category, command..."
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
              {group.tools.slice(0, 25).map((toolGroup) => (
                <button
                  className={`node ${((lane !== "All" && toolGroup.lanes.includes(lane)) ? lane : toolGroup.lanes[0] || "Other").toLowerCase()}`}
                  key={toolGroup.key}
                  onClick={() => {
                    setSelectedToolKey(toolGroup.key);
                    setSelectedVersionIndex(0);
                  }}
                >
                  <strong>{toolGroup.name}</strong>
                  <small>{getFunctionalCategory(toolGroup.versions[0]) || toolGroup.versions[0].Category}</small>
                </button>
              ))}

              {group.tools.length > 25 && (
                <div className="more">+{group.tools.length - 25} more</div>
              )}
            </div>
          </div>
        ))}
      </section>

      {selectedTool && selectedGroup && (
        <aside className="drawer">
          <button
            className="close"
            onClick={() => {
              setSelectedToolKey(null);
              setSelectedVersionIndex(0);
            }}
          >
            ×
          </button>

          <h2>{selectedGroup.name}</h2>
          <p className="badge">{(selectedTool.Lanes || ["Other"]).join(" • ")}</p>

          {selectedGroup.versions.length > 1 && (
            <>
              <h3>Versions</h3>
              <div className="version-list">
                {selectedGroup.versions.map((tool, index) => (
                  <button
                    type="button"
                    className={`version-chip ${selectedVersionIndex === index ? "active" : ""}`}
                    key={`${selectedGroup.key}-${tool.Version || "NA"}-${index}`}
                    onClick={() => setSelectedVersionIndex(index)}
                  >
                    {tool.Version || `Version ${index + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}

          <p>{selectedTool.Description}</p>

          <dl>
            <dt>Version</dt>
            <dd>{selectedTool.Version || "NA"}</dd>

            <dt>Status</dt>
            <dd>{selectedTool.Status || "NA"}</dd>

            <dt>Category</dt>
            <dd>{getCategory(selectedTool) || "NA"}</dd>

            <dt>Functional category</dt>
            <dd>{getFunctionalCategory(selectedTool) || "NA"}</dd>

            <dt>Installed on</dt>
            <dd>{selectedTool.Installed_on || "NA"}</dd>
          </dl>

          {selectedTool.Call_tool && (
            <>
              <h3>Draco command</h3>
              <div className="command-box">
                <button type="button" className="copy-command" onClick={handleCopyCommand}>
                  {commandCopied ? "Copied" : "Copy"} {commandCopied ? "✓" : "📋"}
                </button>
                <pre className="command-pre">{selectedTool.Call_tool}</pre>
              </div>
            </>
          )}

          {selectedTool.URL && (
            <a href={selectedTool.URL} target="_blank" rel="noreferrer">
              Open tool website →
            </a>
          )}

          {selectedTool.Citation && <p className="citation">{selectedTool.Citation}</p>}
        </aside>
      )}
    </main>
  );
}