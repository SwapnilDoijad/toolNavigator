const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getServerApiKey() {
  return process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getServerApiKey();
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Server API key is missing. Set OPENAI_API_KEY in Vercel." });
  }

  const {
    conversationHistory = [],
    userMessage = "",
    toolsContext = [],
    totalToolCount = 0,
  } = req.body || {};

  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful AI assistant for a bioinformatics tools navigation application. Always prioritize the provided tool catalog context first. The catalog context you receive now contains only shortlisted tool names, not full tool metadata. If the user names a sequencing technology such as Nanopore, Illumina, PacBio, or HiFi, treat that technology as a hard relevance requirement. If the user names a domain such as bacteria, virus, phage, fungi, metagenome, or microbiome, treat that domain as a hard relevance requirement. If the user names a task such as assembly, annotation, polishing, binning, mapping, or visualization, treat that task as a hard relevance requirement. When multiple shortlisted tools are relevant, rank them by common usage first so the most commonly used tool for the user's exact intent appears earlier. Do not recommend tools that miss the user's domain or task intent just because they are broadly related. Start the response exactly with 'Top picks (most common for phage annotation):' and do not add any intro sentence before it. Keep the answer concise and use that header only once. Do not use section headers like 'Tool names (from the catalog):' or 'Supporting details (what each is typically used for):'. Do not use filler intros like 'If you tell me'. Prefer unique tool names and do not repeat the same tool in the response. If matching tools exist in the catalog context, explicitly list all relevant tool names first, then explain briefly. Use your general bioinformatics knowledge to choose among the shortlisted tool names, but do not invent commands or metadata. If no matching tool is found in the catalog at all, say so clearly and then provide a general answer.",
    },
    {
      role: "system",
      content: `Catalog context summary: total tools loaded from Google Sheet = ${totalToolCount}. Relevant catalog entries for this query = ${Array.isArray(toolsContext) ? toolsContext.length : 0}. Catalog tool names JSON: ${JSON.stringify(Array.isArray(toolsContext) ? toolsContext : [])}`,
    },
    ...conversationHistory,
    {
      role: "user",
      content: userMessage,
    },
  ];

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // model: "gpt-3.5-turbo",
        model: "gpt-5.4-nano",
        messages,
        temperature: 0.4,
        max_completion_tokens: 500,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage = data.error?.message || `OpenAI API Error: ${response.status}`;
      return res.status(response.status).json({ error: errorMessage });
    }

    const reply = data.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(500).json({ error: "Empty response from OpenAI" });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}
