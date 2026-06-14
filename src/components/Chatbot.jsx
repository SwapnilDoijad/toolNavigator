import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { callOpenAI } from "../api/openai";
import "./Chatbot.css";

function getFunctionalCategory(tool) {
  return tool.primary_function || tool.Primary_function || tool["Primary function"] || tool.FunctionalCategory || tool.Functional_Category || tool.Usage || "";
}

function getSecondaryFunction(tool) {
  return tool.secondary_function || tool.Secondary_function || tool["Secondary function"] || "";
}

function getCategory(tool) {
  return tool.domains || tool.Category || tool.Domain_Category || "";
}

function getToolAdditionalInfo(tool) {
  return tool.tool_additional_info || tool.Tool_additional_info || tool["Tool additional info"] || "";
}

function getToolAliases(tool) {
  return tool.tool_alias || tool.Tool_alias || tool["Tool alias"] || tool.tool_aliases || tool.Tool_aliases || tool["Tool aliases"] || "";
}

function getSupportedTechnologies(tool) {
  return tool.supported_technologies || tool.Supported_technologies || tool["Supported technologies"] || "";
}

function getCommands(tool) {
  return tool.command_templates || tool.Commands || tool.Command || "";
}

function getDracoCommand(tool) {
  return tool.show_help || tool.Call_tool || tool["Call tool"] || tool.Draco_command || tool["Draco command"] || "";
}

function getCommonUseCases(tool) {
  return tool.common_use_cases || tool.Common_use_cases || tool["Common use cases"] || tool.CommonUseCases || tool.Use_cases || "";
}

function getTypicalInputs(tool) {
  return tool.input_formats || tool.Typical_inputs || tool["Typical inputs"] || tool.TypicalInputs || "";
}

function getTypicalOutputs(tool) {
  return tool.output_formats || tool.Typical_outputs || tool["Typical outputs"] || tool.TypicalOutputs || "";
}

function normalizeShortlistText(text) {
  return ` ${String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function extractShortlistedToolKeys(responseText, tools) {
  const normalizedResponse = normalizeShortlistText(responseText);
  const uniqueTools = new Map();

  tools.forEach((tool) => {
    const name = String(tool.tool_name || tool.Name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!uniqueTools.has(key)) uniqueTools.set(key, name);
  });

  const rankedTools = [...uniqueTools.entries()].sort((a, b) => b[1].length - a[1].length);
  return rankedTools
    .filter(([, name]) => normalizedResponse.includes(normalizeShortlistText(name)))
    .map(([key]) => key);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "find",
  "get",
  "give",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "search",
  "that",
  "the",
  "this",
  "tool",
  "tools",
  "to",
  "what",
  "which",
  "with",
  "you",
  "your",
]);

function tokenize(text, removeStopWords = false) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
    .filter((token) => !removeStopWords || !STOP_WORDS.has(token));
}

function stemToken(token) {
  let stem = token;
  const suffixes = ["ation", "ments", "ment", "ingly", "edly", "ingly", "ing", "ers", "er", "ies", "ied", "ed", "es", "s"];

  for (const suffix of suffixes) {
    if (stem.length > suffix.length + 2 && stem.endsWith(suffix)) {
      if (suffix === "ies") {
        return `${stem.slice(0, -3)}y`;
      }
      if (suffix === "ied") {
        return `${stem.slice(0, -3)}y`;
      }
      return stem.slice(0, -suffix.length);
    }
  }

  return stem;
}

function getTokenVariants(token) {
  const variants = new Set([token]);
  const stem = stemToken(token);

  if (stem.length > 2) {
    variants.add(stem);
  }
  if (token.length > 4) {
    variants.add(token.slice(0, -1));
  }

  return [...variants];
}

function boundedEditDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = new Array(b.length + 1);
  let current = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }

    if (rowMin > maxDistance) return maxDistance + 1;

    const temp = previous;
    previous = current;
    current = temp;
  }

  return previous[b.length];
}

function bestVariantScore(variants, toolTokens, toolText) {
  let best = 0;

  for (const variant of variants) {
    if (!variant) continue;

    if (toolTokens.has(variant)) return 1;

    if (variant.length > 4 && toolText.includes(variant)) {
      if (best < 0.8) best = 0.8;
    }

    for (const token of toolTokens) {
      if (token.startsWith(variant) || variant.startsWith(token)) {
        if (Math.min(token.length, variant.length) >= 4 && best < 0.75) best = 0.75;
      }

      const maxDistance = variant.length >= 8 ? 2 : 1;
      if (Math.abs(token.length - variant.length) <= maxDistance) {
        const distance = boundedEditDistance(variant, token, maxDistance);
        if (distance <= maxDistance) {
          const fuzzyScore = distance === 1 ? 0.7 : 0.55;
          if (fuzzyScore > best) best = fuzzyScore;
        }
      }
    }
  }

  return best;
}

function getNormalizedValues(text) {
  return tokenize(text, true);
}

function buildSearchableTokens(text) {
  return new Set(tokenize(text));
}

function fieldTextIncludesAny(fieldText, variants) {
  const normalizedFieldText = normalizeText(fieldText);
  return variants.some((variant) => variant && normalizedFieldText.includes(variant));
}

function findDirectToolMatch(tool, queryTokens) {
  const name = tool.tool_name || tool.Name || "";
  const aliases = getToolAliases(tool);
  const nameTokens = new Set(getNormalizedValues(name));
  const aliasTokens = new Set(getNormalizedValues(aliases));

  for (const queryToken of queryTokens) {
    const variants = getTokenVariants(queryToken);

    if (variants.some((variant) => nameTokens.has(variant))) {
      return true;
    }

    if (variants.some((variant) => aliasTokens.has(variant))) {
      return true;
    }

    if (fieldTextIncludesAny(name, variants) || fieldTextIncludesAny(aliases, variants)) {
      return true;
    }
  }

  return false;
}

function buildToolsContext(tools, userInput) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const queryText = normalizeText(userInput);
  const queryTokens = [...new Set(tokenize(userInput, true))];

  const scored = tools.map((tool) => {
    const nameText = tool.tool_name || tool.Name || "";
    const aliasesText = getToolAliases(tool);
    const primaryMatchText = `${getCategory(tool)} ${getFunctionalCategory(tool)} ${getSupportedTechnologies(tool)}`;
    const secondaryMatchText = `${getSecondaryFunction(tool)} ${tool.description || tool.Description || ""} ${getCommonUseCases(tool)}`;
    const searchableText = normalizeText(
      `${nameText} ${aliasesText} ${getToolAdditionalInfo(tool)} ${primaryMatchText} ${secondaryMatchText}`
    );
    const toolTokens = buildSearchableTokens(searchableText);
    const nameTokens = new Set(getNormalizedValues(nameText));
    const aliasTokens = new Set(getNormalizedValues(aliasesText));
    const primaryTokens = buildSearchableTokens(normalizeText(primaryMatchText));
    const secondaryTokens = buildSearchableTokens(normalizeText(secondaryMatchText));

    let score = 0;

    if (findDirectToolMatch(tool, queryTokens)) {
      // Direct name/alias hits should boost ranking, not short-circuit the shortlist.
      score += 1.6;
    }

    for (const queryToken of queryTokens) {
      const variants = getTokenVariants(queryToken);

      const primaryScore = bestVariantScore(variants, primaryTokens, normalizeText(primaryMatchText));
      const secondaryScore = bestVariantScore(variants, secondaryTokens, normalizeText(secondaryMatchText));
      const tokenScore = Math.max(primaryScore * 2, secondaryScore);
      score += tokenScore;

      for (const variant of variants) {
        if (nameTokens.has(variant) || aliasTokens.has(variant)) {
          score += 0.4;
          break;
        }
      }
    }

    if (queryText && searchableText.includes(queryText)) {
      score += 1.5;
    }

    return {
      score,
      item: {
        name: tool.tool_name || tool.Name || "NA",
        version: tool.version || tool.Version || "NA",
        additionalInfo: getToolAdditionalInfo(tool) || "NA",
        category: getCategory(tool) || "NA",
        supportedTechnologies: getSupportedTechnologies(tool) || "NA",
        functionalCategory: getFunctionalCategory(tool) || "NA",
        secondaryFunction: getSecondaryFunction(tool) || "NA",
        description: tool.description || tool.Description || "NA",
        commonUseCases: getCommonUseCases(tool) || "NA",
        helpCommand: getDracoCommand(tool) || "NA",
        url: tool.tool_link || tool.URL || "",
      },
    };
  });

  const withMatches = scored.filter((entry) => entry.score >= 1.2);
  const source = withMatches.length > 0 ? withMatches : scored;
  const ranked = source.sort((a, b) => b.score - a.score);

  // Keep only the highest-scoring matches for concise, deterministic shortlist behavior.
  return ranked.slice(0, 6).map((entry) => entry.item);
}

export default function Chatbot({ tools = [], onShortlistTools }) {
  const defaultWidth = 480;
  const defaultHeight = 560;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your AI assistant. How can I help you with your tools and workflows today?",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [posX, setPosX] = useState(typeof window !== "undefined" ? window.innerWidth / 2 - defaultWidth / 2 : 0);
  const [posY, setPosY] = useState(typeof window !== "undefined" ? window.innerHeight / 2 - defaultHeight / 2 : 0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [prevDimensions, setPrevDimensions] = useState({ width: defaultWidth, height: defaultHeight, posX: 0, posY: 0 });
  const messagesEndRef = useRef(null);
  const windowRef = useRef(null);
  const isResizingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const resizeEdgeRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle drag
  const handleDragStart = (e) => {
    if (isMinimized || isMaximized || e.button !== 0) return;
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = posX;
    const startPosY = posY;

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const maxX = Math.max(0, window.innerWidth - width);
      const maxY = Math.max(0, window.innerHeight - height);

      setPosX(Math.max(0, Math.min(maxX, startPosX + deltaX)));
      setPosY(Math.max(0, Math.min(maxY, startPosY + deltaY)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Handle resize from any edge/corner
  const handleResizeStart = (e, edge) => {
    if (e.button !== 0 || isMinimized || isMaximized) return;
    isResizingRef.current = true;
    resizeEdgeRef.current = edge;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;
    const startPosX = posX;
    const startPosY = posY;

    const handleMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const minWidth = 400;
      const minHeight = 400;
      const maxWidth = Math.min(window.innerWidth * 0.95, 1200);
      const maxHeight = Math.min(window.innerHeight * 0.95, 1000);

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newPosX = startPosX;
      let newPosY = startPosY;

      if (edge.includes("e")) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
      }
      if (edge.includes("w")) {
        newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
        newPosX = startPosX + (startWidth - newWidth);
      }
      if (edge.includes("s")) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      }
      if (edge.includes("n")) {
        newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
        newPosY = startPosY + (startHeight - newHeight);
      }

      setWidth(newWidth);
      setHeight(newHeight);
      setPosX(newPosX);
      setPosY(newPosY);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      resizeEdgeRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setIsOpen(false);
    setIsMaximized(false);
  };

  const handleMaximize = () => {
    if (!isMaximized) {
      setPrevDimensions({ width, height, posX, posY });
      setWidth(window.innerWidth - 40);
      setHeight(window.innerHeight - 120);
      setPosX(20);
      setPosY(20);
      setIsMaximized(true);
      setIsMinimized(false);
      return;
    }

    setWidth(prevDimensions.width);
    setHeight(prevDimensions.height);
    setPosX(prevDimensions.posX);
    setPosY(prevDimensions.posY);
    setIsMaximized(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!input.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      text: input,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const toolsContext = buildToolsContext(tools, input);

      // Call OpenAI API with sheet-first context
      const response = await callOpenAI(
        messages.map((msg) => ({
          role: msg.sender === "user" ? "user" : "assistant",
          content: msg.text,
        })),
        input,
        {
          toolsContext,
          totalToolCount: tools.length,
        }
      );

      const botMessage = {
        id: Date.now() + 1,
        text: response,
        sender: "bot",
        timestamp: new Date(),
      };

      if (typeof onShortlistTools === "function") {
        const matchedToolKeys = [...new Set(
          toolsContext
            .map((tool) => String(tool.name || "").trim().toLowerCase())
            .filter(Boolean)
        )];

        onShortlistTools(
          matchedToolKeys.length > 0 ? matchedToolKeys : extractShortlistedToolKeys(response, tools)
        );
      }

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setError(err.message || "Failed to get response from AI");
      console.error("Chatbot error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 1,
        text: "Hi! I'm your AI assistant. Ask me about tools and workflows today? For example, you can ask: 'How can I assemble nanopore reads?'",
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
    setError(null);
  };

  const toggleImageSize = 120;
  const toggleStyle = isOpen
    ? {
        left: `${posX + width / 2}px`,
        top: `${Math.max(8, posY - toggleImageSize / 2)}px`,
        bottom: "auto",
      }
    : undefined;

  return (
    <div className="chatbot-container">
      {/* Floating Button */}
      <button
        className="chatbot-toggle"
        style={toggleStyle}
        onClick={() => {
          if (isMinimized) {
            setIsMinimized(false);
            setIsOpen(true);
          } else {
            setIsOpen(!isOpen);
          }
        }}
        aria-label={isOpen ? "Close chatbot" : "Open chatbot"}
        title={isMinimized ? "Restore chatbot" : isOpen ? "Close chatbot" : "Open chatbot"}
      >
        <img src="/chatbot.png" alt="Chatbot" className="chatbot-toggle-image" />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div 
          className={`chatbot-window ${isMinimized ? "minimized" : ""} ${isMaximized ? "maximized" : ""}`}
          ref={windowRef}
          style={{
            width: `${width}px`,
            height: isMinimized ? "auto" : `${height}px`,
            left: `${posX}px`,
            top: `${posY}px`,
          }}
        >
          {/* Header - Draggable */}
          <div 
            className="chatbot-header"
            onMouseDown={handleDragStart}
            style={{ cursor: isDraggingRef.current ? "grabbing" : "grab" }}
          >
            <h3>How can I assist you?</h3>
            <div className="chatbot-controls">
              <button
                className="chatbot-minimize-btn"
                onClick={handleMinimize}
                title={isMinimized ? "Restore" : "Minimize"}
              >
                {isMinimized ? "▢" : "−"}
              </button>
              <button
                className="chatbot-maximize-btn"
                onClick={handleMaximize}
                title={isMaximized ? "Restore" : "Maximize"}
              >
                {isMaximized ? "▢" : "□"}
              </button>
              <button
                className="chatbot-clear-btn"
                onClick={handleClear}
                title="Clear conversation"
              >
                🔄
              </button>
              <button
                className="chatbot-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close chatbot"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages - Only show if not minimized */}
          {!isMinimized && (
            <>
              <div className="chatbot-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`chatbot-message chatbot-message-${message.sender}`}
                  >
                    <div className="chatbot-message-content">
                      {message.sender === "bot" ? (
                        <ReactMarkdown>{message.text}</ReactMarkdown>
                      ) : (
                        message.text
                      )}
                    </div>
                    <span className="chatbot-message-time">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
                {isLoading && (
                  <div className="chatbot-message chatbot-message-bot chatbot-loading">
                    <div className="chatbot-typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="chatbot-message chatbot-message-error">
                    <div className="chatbot-message-content">
                      ⚠️ {error}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="chatbot-form">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="chatbot-input"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="chatbot-send-btn"
                  aria-label="Send message"
                >
                  {isLoading ? "..." : "→"}
                </button>
              </form>

              {/* Resize Handle */}
              {/* Resize Handles for all edges */}
              <div className="chatbot-resize-handle n" onMouseDown={(e) => handleResizeStart(e, "n")} title="Resize top" />
              <div className="chatbot-resize-handle s" onMouseDown={(e) => handleResizeStart(e, "s")} title="Resize bottom" />
              <div className="chatbot-resize-handle w" onMouseDown={(e) => handleResizeStart(e, "w")} title="Resize left" />
              <div className="chatbot-resize-handle e" onMouseDown={(e) => handleResizeStart(e, "e")} title="Resize right" />
              <div className="chatbot-resize-handle nw" onMouseDown={(e) => handleResizeStart(e, "nw")} title="Resize top-left" />
              <div className="chatbot-resize-handle ne" onMouseDown={(e) => handleResizeStart(e, "ne")} title="Resize top-right" />
              <div className="chatbot-resize-handle sw" onMouseDown={(e) => handleResizeStart(e, "sw")} title="Resize bottom-left" />
              <div className="chatbot-resize-handle se" onMouseDown={(e) => handleResizeStart(e, "se")} title="Resize bottom-right" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
