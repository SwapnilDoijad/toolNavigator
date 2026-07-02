/**
 * OpenAI API integration strategy:
 * 1) Preferred: call our serverless proxy at /api/chat (keeps API key server-side).
 * 2) Fallback: direct client call using VITE_OPENAI_API_KEY for local-only development.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const CLIENT_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

async function callViaServerProxy(conversationHistory, userMessage, context = {}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      conversationHistory,
      userMessage,
      toolsContext: context.toolsContext || [],
      totalToolCount: context.totalToolCount || 0,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `API Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.reply;
}

async function callDirectFromClient(messages) {
  if (!CLIENT_API_KEY) {
    throw new Error(
      "OpenAI API key is not configured. Local dev: add VITE_OPENAI_API_KEY to .env.local and restart. Vercel: set OPENAI_API_KEY (recommended) or VITE_OPENAI_API_KEY in Project Settings and redeploy."
    );
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLIENT_API_KEY}`,
    },
    body: JSON.stringify({
      // model: "gpt-3.5-turbo",
      model: "gpt-5.4-nano",
      messages,
      temperature: 0.4,
      max_completion_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Calls OpenAI Chat API with conversation context
 * @param {Array} conversationHistory - Array of previous messages with role and content
 * @param {string} userMessage - The current user message
 * @param {Object} context - Additional context from sheet data
 * @returns {Promise<string>} - The AI response
 */
export async function callOpenAI(conversationHistory, userMessage, context = {}) {
  try {
    const toolsContext = context.toolsContext || [];
    const totalToolCount = context.totalToolCount || 0;

    const messages = [
      {
        role: "system",
        content:
            "You are a helpful AI assistant for a bioinformatics tools navigation application. Always prioritize the provided tool catalog context first. The catalog context you receive now contains only shortlisted tool names, not full tool metadata. If the user names a sequencing technology such as Nanopore, Illumina, PacBio, or HiFi, treat that technology as a hard relevance requirement. If the user names a domain such as bacteria, virus, phage, fungi, metagenome, or microbiome, treat that domain as a hard relevance requirement. If the user names a task such as assembly, annotation, polishing, binning, mapping, or visualization, treat that task as a hard relevance requirement. When multiple shortlisted tools are relevant, rank them by common usage first so the most commonly used tool for the user's exact intent appears earlier. Do not recommend tools that miss the user's domain or task intent just because they are broadly related. If matching tools exist in the catalog context, explicitly list all relevant tool names first, then explain briefly. Use your general bioinformatics knowledge to choose among the shortlisted tool names, but do not invent commands or metadata. If no matching tool is found in the catalog at all, say so clearly and then provide a general answer.",
      },
      {
        role: "system",
        content: `Catalog context summary: total tools loaded from Google Sheet = ${totalToolCount}. Relevant catalog entries for this query = ${toolsContext.length}. Catalog tool names JSON: ${JSON.stringify(toolsContext)}`,
      },
      ...conversationHistory,
      {
        role: "user",
        content: userMessage,
      },
    ];

    try {
      return await callViaServerProxy(conversationHistory, userMessage, {
        toolsContext,
        totalToolCount,
      });
    } catch (proxyError) {
      // In local Vite dev, /api/chat may not exist. Fallback to client-side key.
      const canFallbackToClient =
        proxyError instanceof Error &&
        (/404|Failed to fetch|NetworkError/i.test(proxyError.message) || !!CLIENT_API_KEY);

      if (!canFallbackToClient) {
        throw proxyError;
      }

      return await callDirectFromClient(messages);
    }
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw error;
  }
}
