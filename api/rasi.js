// Secure RĀSI AI endpoint.
// Keep OPENAI_API_KEY on the server only. Never put it in the Android app or GitHub client code.

const ALLOWED_ORIGIN = process.env.RASI_ALLOWED_ORIGIN || "https://clevercreations01.github.io";
const MODEL = process.env.RASI_MODEL || "gpt-5.6-luna";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    action: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: ["add_task","delete_task","edit_task","move_task","reschedule_task","complete_task","reorder_task","toggle_college","set_college"]
            },
            details: {
              type: "object",
              additionalProperties: true
            }
          },
          required: ["type","details"]
        }
      ]
    }
  },
  required: ["reply","action"]
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function systemPrompt() {
  return [
    "You are RĀSI, a personal AI companion and planner.",
    "Talk naturally like a sharp, warm, funny Gen-Z friend when appropriate. Do not sound like a corporate productivity bot.",
    "Understand casual language, slang, incomplete sentences, context, and emotional conversation.",
    "Do not force productivity advice into ordinary conversation.",
    "The user remains the decision-maker. You may give a perspective when asked, but do not make life decisions for them.",
    "You are also allowed to operate the user's local schedule, but ONLY when the conversation clearly indicates that the user wants a schedule/app change.",
    "You must decide that intent from the conversation and current schedule. The client does not classify intent for you.",
    "If the user is merely chatting, action MUST be null.",
    "If the user asks for a schedule/app change but important details are genuinely missing, ask a concise clarification and set action to null.",
    "Never claim a schedule change happened unless you return an action for it.",
    "Return ONLY the JSON object matching the schema.",
    "For schedule actions, use details with explicit values. Dates may be today, tomorrow, day after tomorrow, or YYYY-MM-DD.",
    "Use task name/category/time from the supplied schedule when referring to an existing task. Prefer taskId when available.",
    "Do not invent tasks, times, or commitments that are not in the supplied schedule unless the user explicitly asks you to add something.",
    "For add_task, details should include name, start, end, category, date, and optional info.",
    "For delete_task/edit_task/move_task/reschedule_task/complete_task/reorder_task, include date and taskId or an exact task name.",
    "For move/reschedule, preserve the task duration when only a new start time is given.",
    "For college changes, use toggle_college with date and enabled.",
    "Keep replies concise unless the user clearly asks for depth."
  ].join("\n");
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({error:"RĀSI AI server is not configured"});

  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages.slice(-15) : [];
    const schedule = body.schedule || {};
    const currentMessage = String(body.currentMessage || "").trim();

    if (!currentMessage) return res.status(400).json({error:"Missing message"});
    if (currentMessage.length > 4000) return res.status(400).json({error:"Message too long"});

    const userInput = JSON.stringify({
      conversation: messages,
      current_schedule: schedule,
      current_message: currentMessage
    });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        instructions: systemPrompt(),
        input: userInput,
        max_output_tokens: 900,
        text: {
          format: {
            type: "json_schema",
            name: "rasi_response",
            strict: true,
            schema
          }
        }
      })
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("OpenAI error", data);
      return res.status(502).json({error:"AI provider request failed"});
    }

    const outputText = data.output_text;
    if (!outputText) return res.status(502).json({error:"AI returned no structured response"});

    let result;
    try { result = JSON.parse(outputText); }
    catch (_) { return res.status(502).json({error:"AI returned invalid JSON"}); }

    if (typeof result.reply !== "string" || !("action" in result)) {
      return res.status(502).json({error:"AI response failed schema validation"});
    }

    return res.status(200).json({reply:result.reply, action:result.action});
  } catch (err) {
    console.error("RASI API error", err);
    return res.status(500).json({error:"RĀSI AI request failed"});
  }
};
