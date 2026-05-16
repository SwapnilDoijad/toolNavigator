import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { callOpenAI } from "../api/openai";
import "./Chatbot.css";

function getFunctionalCategory(tool) {
  return tool.FunctionalCategory || tool.Functional_Category || tool.Usage || "";
}

function getCategory(tool) {
  return tool.Category || tool.Domain_Category || "";
}

function getCommands(tool) {
  return tool.Commands || tool.Command || "";
}

function getDracoCommand(tool) {
  return tool.Call_tool || tool["Call tool"] || tool.Draco_command || tool["Draco command"] || "";
}

function getCommonUseCases(tool) {
  return tool.Common_use_cases || tool["Common use cases"] || tool.CommonUseCases || tool.Use_cases || "";
}

function getTypicalInputs(tool) {
  return tool.Typical_inputs || tool["Typical inputs"] || tool.TypicalInputs || "";
}

function getTypicalOutputs(tool) {
  return tool.Typical_outputs || tool["Typical outputs"] || tool.TypicalOutputs || "";
}

function buildToolsContext(tools, userInput) {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const tokens = String(userInput || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2);

  const scored = tools.map((tool) => {
    const haystack = `${tool.Name || ""} ${tool.Description || ""} ${getCategory(tool)} ${getFunctionalCategory(tool)} ${getCommands(tool)} ${getDracoCommand(tool)}`.toLowerCase();

    const score = tokens.reduce((acc, token) => acc + (haystack.includes(token) ? 1 : 0), 0);

    return {
      score,
      item: {
        name: tool.Name || "NA",
        version: tool.Version || "NA",
        category: getCategory(tool) || "NA",
        functionalCategory: getFunctionalCategory(tool) || "NA",
        description: tool.Description || "NA",
        helpCommand: getDracoCommand(tool) || "NA",
        url: tool.URL || "",
      },
    };
  });

  const withMatches = scored.filter((entry) => entry.score > 0);
  const source = withMatches.length > 0 ? withMatches : scored;

  return source
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.item);
}

export default function Chatbot({ tools = [] }) {
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
            <h3>AI Assistant</h3>
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
