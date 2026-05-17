import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { callOpenAI } from "../api/openai";
import "./Chatbot.css";

function getFunctionalCategory(tool) {
  return tool.FunctionalCategory || tool.Functional_Category || tool.Usage || "";
}

function getCategory(tool) {
  return tool.domains || tool.Category || tool.Domain_Category || "";
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

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
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

function buildToolsContext(tools, userInput) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const queryText = normalizeText(userInput);
  const queryTokens = [...new Set(tokenize(userInput))];

  const scored = tools.map((tool) => {
    const searchableText = normalizeText(
      `${tool.tool_name || tool.Name || ""} ${tool.description || tool.Description || ""} ${getCategory(tool)} ${getFunctionalCategory(tool)} ${getCommands(tool)} ${getDracoCommand(tool)} ${tool.tool_link || tool.URL || ""}`
    );
    const toolTokens = new Set(tokenize(searchableText));
    const nameTokens = new Set(tokenize(tool.tool_name || tool.Name || ""));

    let score = 0;

    for (const queryToken of queryTokens) {
      const variants = getTokenVariants(queryToken);
      const tokenScore = bestVariantScore(variants, toolTokens, searchableText);
      score += tokenScore;

      for (const variant of variants) {
        if (nameTokens.has(variant)) {
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
        category: getCategory(tool) || "NA",
        functionalCategory: getFunctionalCategory(tool) || "NA",
        description: tool.description || tool.Description || "NA",
        helpCommand: getDracoCommand(tool) || "NA",
        url: tool.tool_link || tool.URL || "",
      },
    };
  });

  const withMatches = scored.filter((entry) => entry.score >= 1.2);
  const source = withMatches.length > 0 ? withMatches : scored;

  return source
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.item);
}

export default function Chatbot({ tools = [], onShortlistTools }) {
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
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        onShortlistTools(extractShortlistedToolKeys(response, tools));
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
        text: "Hi! I'm your AI assistant. How can I help you with your tools and workflows today?",
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
    setError(null);
  };

  return (
    <div className="chatbot-container">
      {/* Floating Button */}
      <button
        className="chatbot-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle chatbot"
        title="Open chatbot"
      >
        {isOpen ? "✕" : "💬"}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <h3>How can I assist you?</h3>
            <div className="chatbot-controls">
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

          {/* Messages */}
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
        </div>
      )}
    </div>
  );
}
