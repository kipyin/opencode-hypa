#!/usr/bin/env node
/**
 * Local OpenAI-compatible stub for the OpenCode loader smoke.
 *
 * First chat turn always emits a `bash` tool call (`git status` by default).
 * After a tool result is present, it returns a short stop message so the
 * session cannot loop. No network, no credentials.
 *
 * Env:
 *   SMOKE_DUMMY_PORT     listen port (default 14197)
 *   SMOKE_DUMMY_HOST     bind address (default 127.0.0.1)
 *   SMOKE_DUMMY_LOG      optional request log path
 *   SMOKE_COMMAND        bash command to emit (default "git status")
 */
import http from "node:http"
import { appendFileSync } from "node:fs"

const host = process.env.SMOKE_DUMMY_HOST || "127.0.0.1"
const port = Number(process.env.SMOKE_DUMMY_PORT || 14197)
const command = process.env.SMOKE_COMMAND || "git status"
const logPath = process.env.SMOKE_DUMMY_LOG

function log(line) {
  const text = `[dummy-openai] ${line}`
  console.error(text)
  if (logPath) {
    try {
      appendFileSync(logPath, `${text}\n`)
    } catch {
      // ignore log IO failures
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

function messagesHaveToolResult(messages) {
  for (const message of messages ?? []) {
    if (!message || typeof message !== "object") continue
    if (message.role === "tool") return true
    if (typeof message.tool_call_id === "string" && message.tool_call_id) return true
  }
  return false
}

function messageSummary(messages) {
  return (messages ?? []).map((message) => ({
    role: message?.role,
    tool_call_id: message?.tool_call_id,
    tool_calls: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
    contentType: Array.isArray(message?.content) ? "array" : typeof message?.content,
  }))
}

function completionId() {
  return `chatcmpl-hypa-smoke-${Date.now()}`
}

function toolCallMessage() {
  return {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_hypa_smoke",
        type: "function",
        function: {
          name: "bash",
          arguments: JSON.stringify({ command }),
        },
      },
    ],
  }
}

function nonStreamBody(done) {
  const id = completionId()
  if (done) {
    return {
      id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "dummy",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }
  }
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "dummy",
    choices: [
      {
        index: 0,
        message: toolCallMessage(),
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

function writeSse(res, done) {
  const id = completionId()
  const created = Math.floor(Date.now() / 1000)
  const first = done
    ? {
        id,
        object: "chat.completion.chunk",
        created,
        model: "dummy",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "ok" },
            finish_reason: null,
          },
        ],
      }
    : {
        id,
        object: "chat.completion.chunk",
        created,
        model: "dummy",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  index: 0,
                  id: "call_hypa_smoke",
                  type: "function",
                  function: {
                    name: "bash",
                    arguments: JSON.stringify({ command }),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }
  const last = {
    id,
    object: "chat.completion.chunk",
    created,
    model: "dummy",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: done ? "stop" : "tool_calls",
      },
    ],
  }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  })
  res.write(`data: ${JSON.stringify(first)}\n\n`)
  res.write(`data: ${JSON.stringify(last)}\n\n`)
  res.write("data: [DONE]\n\n")
  res.end()
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/"
  try {
    if (req.method === "GET" && url.includes("/models")) {
      return sendJson(res, 200, {
        object: "list",
        data: [{ id: "dummy", object: "model", owned_by: "hypa-smoke" }],
      })
    }
    if (req.method === "GET" && (url === "/" || url.includes("/health"))) {
      return sendJson(res, 200, { ok: true })
    }
    if (req.method !== "POST" || !url.includes("chat/completions")) {
      res.writeHead(404)
      res.end("not found")
      return
    }

    const raw = await readBody(req)
    let body = {}
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch {
      body = {}
    }
    const done = messagesHaveToolResult(body.messages)
    const summary = {
      url,
      stream: Boolean(body.stream),
      done,
      model: body.model,
      tools: Array.isArray(body.tools) ? body.tools.map((tool) => tool?.function?.name || tool?.name || tool?.type) : [],
      messages: messageSummary(body.messages),
    }
    log(`${req.method} ${url} stream=${summary.stream} done=${done} tools=${JSON.stringify(summary.tools)}`)
    if (logPath) {
      try {
        appendFileSync(logPath, `${JSON.stringify(summary)}\n`)
      } catch {
        // ignore
      }
    }
    if (body.stream) writeSse(res, done)
    else sendJson(res, 200, nonStreamBody(done))
  } catch (error) {
    log(`handler error: ${error instanceof Error ? error.message : String(error)}`)
    if (!res.headersSent) sendJson(res, 500, { error: { message: String(error) } })
    else res.end()
  }
})

server.listen(port, host, () => {
  log(`listening on http://${host}:${port}`)
})
