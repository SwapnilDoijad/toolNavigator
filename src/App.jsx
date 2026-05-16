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
  { name: "Bacteria", icon: "/bacteria.png", label: "Bacteria" },
  { name: "Phage", icon: "/phage.png", label: "Phage" },
  { name: "Metagenome", icon: "/metagenome.png", label: "Metagenome" },
  { name: "Microbiome", icon: "/microbiome.png", label: "Microbiome" },
  { name: "Virome", icon: "/virome.png", label: "Virome" },
  { name: "All", icon: null, label: "All tools" },
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

function normalizeHeaderKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getFirstValue(tool, keys) {
  const normalizedWanted = new Set(keys.map((key) => normalizeHeaderKey(key)));

  for (const [key, value] of Object.entries(tool)) {
    if (!normalizedWanted.has(normalizeHeaderKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getDracoCommand(tool) {
  return getFirstValue(tool, ["Call_tool", "Call tool", "Draco_command", "Draco command"]);
}

function getCommands(tool) {
  return getFirstValue(tool, ["Commands", "Command"]);
}

function getCommonUseCases(tool) {
  return getFirstValue(tool, ["Common_use_cases", "Common use cases", "CommonUseCases", "Use_cases"]);
}

function getTypicalInputs(tool) {
  return getFirstValue(tool, ["Typical_inputs", "Typical inputs", "TypicalInputs"]);
}

function getTypicalOutputs(tool) {
  return getFirstValue(tool, ["Typical_outputs", "Typical outputs", "TypicalOutputs"]);
}

function getCategory(tool) {
  return tool.Category || tool.Domain_Category || "";
}

function getDisplayStatus(tool) {
  const status = tool.Status || "";
  const statusParts = status
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return statusParts[1] || statusParts[0] || "";
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
    ${getDracoCommand(tool)}
    ${getCommands(tool)}
    ${getCommonUseCases(tool)}
    ${getTypicalInputs(tool)}
    ${getTypicalOutputs(tool)}
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
      existing.versions.push(tool);
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
    const command = selectedTool ? getDracoCommand(selectedTool) : "";
    if (!command) return;

    const copied = await copyText(command);
    if (!copied) return;

    setCommandCopied(true);
    window.setTimeout(() => setCommandCopied(false), 1800);
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="hero-copy">
          <p className="eyebrow">VEO Microbial Bioinformatics Tools</p>
          <h1>Interactive tool navigator</h1>
          <p>
            click to choose the best tool for your needs, explore details and get the command to run it with Draco.
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
            className={`lane-card lane-${item.name.toLowerCase()} ${item.icon ? "" : "no-icon"} ${lane === item.name ? "active" : ""}`}
            onClick={() => setLane(item.name)}
          >
            {item.icon && <img src={item.icon} alt={item.label} className="lane-icon" />}
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
            <dd>{getDisplayStatus(selectedTool) || "NA"}</dd>

            <dt>Category</dt>
            <dd>{getCategory(selectedTool) || "NA"}</dd>

            <dt>Function</dt>
            <dd>{getFunctionalCategory(selectedTool) || "NA"}</dd>

            <dt>Installed on</dt>
            <dd>{selectedTool.Installed_on || "NA"}</dd>
          </dl>

          {getDracoCommand(selectedTool) && (
            <>
              <h3>Help command</h3>
              <div className="command-box">
                <button type="button" className="copy-command" onClick={handleCopyCommand}>
                  {commandCopied ? "Copied" : "Copy"} {commandCopied ? "✓" : "📋"}
                </button>
                <pre className="command-pre">{getDracoCommand(selectedTool)}</pre>
              </div>
            </>
          )}

          <>
            <h3>Commands</h3>
            <pre className="detail-pre">{getCommands(selectedTool) || "NA"}</pre>
          </>

          <>
            <h3>Common use cases</h3>
            <pre className="detail-pre">{getCommonUseCases(selectedTool) || "NA"}</pre>
          </>

          <>
            <h3>Typical inputs</h3>
            <pre className="detail-pre">{getTypicalInputs(selectedTool) || "NA"}</pre>
          </>

          <>
            <h3>Typical outputs</h3>
            <pre className="detail-pre">{getTypicalOutputs(selectedTool) || "NA"}</pre>
          </>

          {selectedTool.URL && (
            <a href={selectedTool.URL} target="_blank" rel="noreferrer">
              Open tool website →
            </a>
          )}

          {selectedTool.Reference && (
            <a href={selectedTool.Reference} target="_blank" rel="noreferrer" className="reference">
              Open reference →
            </a>
          )}

          {selectedTool.Citation && <p className="citation">{selectedTool.Citation}</p>}
        </aside>
      )}
    </main>
  );
}