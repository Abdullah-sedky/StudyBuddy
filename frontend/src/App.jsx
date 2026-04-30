import React, { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  themeVariables: {
    fontFamily: "Nunito, sans-serif",
    fontSize: "13px",
    primaryColor: "#e8e1d6",
    primaryTextColor: "#2e271f",
    primaryBorderColor: "#d9d0c3",
    lineColor: "#a89880",
    secondaryColor: "#f2ede4",
    tertiaryColor: "#faf8f4",
  },
});

// In local dev default to Vite proxy (/api -> backend on :8000).
// In production (same-origin deploy), this resolves to "" unless overridden.
const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "");

// ── Mermaid diagram block ──────────────────────────────────────────────────

function MermaidBlock({ code, onZoom }) {
  const containerRef = useRef(null);
  const [error, setError]     = useState(null);
  const [rendered, setRendered] = useState(false);
  const [svgContent, setSvgContent] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setSvgContent(svg);
          setRendered(true);
        }
      })
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <pre className="text-xs text-sand-500 bg-sand-100 border border-sand-300 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      onClick={() => svgContent && onZoom?.(svgContent)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && svgContent) {
          e.preventDefault();
          onZoom?.(svgContent);
        }
      }}
      className={`
        my-2 rounded-xl border border-sand-200 bg-sand-50 p-4
        flex items-center justify-center overflow-x-auto cursor-zoom-in
        focus:outline-none focus:ring-2 focus:ring-sand-400
        transition-opacity duration-300
        ${rendered ? "opacity-100" : "opacity-0"}
      `}
      title="Click to zoom"
    />
  );
}

// ── Message content parser ─────────────────────────────────────────────────
// Splits a message string into alternating text / mermaid segments

function parseContent(content) {
  const parts  = [];
  const regex  = /```mermaid\n([\s\S]*?)```/g;
  let last     = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", content: content.slice(last, match.index) });
    }
    parts.push({ type: "mermaid", content: match[1].trim() });
    last = match.index + match[0].length;
  }

  if (last < content.length) {
    parts.push({ type: "text", content: content.slice(last) });
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}

function MessageContent({ content, onZoomDiagram }) {
  const parts = parseContent(content);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "mermaid" ? (
          <MermaidBlock key={i} code={part.content} onZoom={onZoomDiagram} />
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {part.content.replace(/\*\*(.*?)\*\*/g, "$1")}
          </span>
        )
      )}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function FileIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-sand-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-5 h-5 text-sand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [sessionId, setSessionId]         = useState(null);
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver]           = useState(false);
  const [zoomedDiagramSvg, setZoomedDiagramSvg] = useState("");
  const [assessment, setAssessment] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const bottomRef    = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/session`)
      .then(r => r.json())
      .then(d => setSessionId(d.session_id))
      .catch(() => setSessionId("default"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!zoomedDiagramSvg) return;
    const onEsc = (e) => {
      if (e.key === "Escape") setZoomedDiagramSvg("");
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [zoomedDiagramSvg]);

  const uploadFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "pptx"].includes(ext)) {
      alert("Only PDF and PPTX files are supported.");
      return;
    }
    if (uploadedFiles.find(f => f.name === file.name)) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (res.ok) {
        const sizeKb = (file.size / 1024).toFixed(1);
        const size   = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
        const time   = new Date().toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
        setUploadedFiles(prev => [...prev, { name: file.name, size, type: ext.toUpperCase(), time }]);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `**${file.name}** has been indexed and is ready to use.`,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Upload failed: ${data.detail || `HTTP ${res.status}`}`,
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Could not reach the server. Is the backend running?",
      }]);
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFile(e.dataTransfer.files[0]);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res  = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, session_id: sessionId }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: res.ok ? data.answer : (data.detail || "Something went wrong."),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Could not reach the server.",
      }]);
    }
    setLoading(false);
  };

  const clearChat = async () => {
    setMessages([]);
    setAssessment(null);
    setSelectedAnswers({});
    setAssessmentSubmitted(false);
    try {
      const res  = await fetch(`${API}/session`);
      const data = await res.json();
      setSessionId(data.session_id);
    } catch {}
  };

  const generateAssessment = async (kind) => {
    if (assessmentLoading) return;
    setAssessmentLoading(true);
    setAssessment(null);
    setSelectedAnswers({});
    setAssessmentSubmitted(false);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: kind === "exam"
        ? "Generating a model exam from your uploaded material..."
        : "Generating an MCQ quiz from your uploaded material..."
    }]);

    try {
      const res = await fetch(`${API}/assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          session_id: sessionId || "default",
          num_questions: kind === "exam" ? 10 : 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not generate assessment.");
      }
      setAssessment(data);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Your ${kind === "exam" ? "model exam" : "MCQ quiz"} is ready below. Select answers and submit when done.`
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Assessment generation failed: ${e.message || "Unknown error"}`
      }]);
    }
    setAssessmentLoading(false);
  };

  const score = assessment
    ? assessment.questions.reduce((acc, q, idx) => (
      selectedAnswers[idx] === q.correct_index ? acc + 1 : acc
    ), 0)
    : 0;

  return (
    <div className="flex h-screen bg-sand-100 font-sans text-sand-900 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 bg-sand-200 border-r border-sand-300 flex flex-col">

        {/* Brand */}
        <div className="px-5 pt-6 pb-4">
          <h1 className="font-display text-lg font-semibold text-sand-800 leading-tight">
            Study Assistant
          </h1>
          <p className="text-xs text-sand-500 mt-0.5">Groq · LangChain · ChromaDB</p>
        </div>

        <div className="mx-4 border-t border-sand-300" />

        {/* Upload zone */}
        <div className="px-4 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sand-500 mb-2.5">
            Practice mode
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => generateAssessment("mcq")}
              disabled={assessmentLoading}
              className="flex-1 text-xs font-medium text-sand-700 bg-sand-50 hover:bg-sand-100 border border-sand-300 rounded-lg py-2 transition-all duration-150 disabled:opacity-60"
            >
              MCQ Quiz
            </button>
            <button
              onClick={() => generateAssessment("exam")}
              disabled={assessmentLoading}
              className="flex-1 text-xs font-medium text-sand-700 bg-sand-50 hover:bg-sand-100 border border-sand-300 rounded-lg py-2 transition-all duration-150 disabled:opacity-60"
            >
              Model Exam
            </button>
          </div>
          {assessmentLoading && (
            <p className="text-[10px] text-sand-400 mt-2">Preparing questions...</p>
          )}
        </div>

        <div className="mx-4 mt-4 border-t border-sand-300" />

        <div className="px-4 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sand-500 mb-2.5">
            Upload document
          </p>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`
              flex flex-col items-center justify-center gap-2
              rounded-xl border-2 border-dashed cursor-pointer
              py-5 px-3 text-center transition-all duration-200
              ${dragOver
                ? "border-sand-500 bg-sand-300"
                : "border-sand-300 bg-sand-50 hover:border-sand-400 hover:bg-sand-100"}
            `}
          >
            {uploading ? (
              <div className="flex items-center gap-2 text-sand-500">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-xs">Indexing...</span>
              </div>
            ) : (
              <>
                <UploadIcon />
                <span className="text-xs text-sand-500 leading-relaxed">
                  Drop a file or{" "}
                  <span className="text-sand-700 font-medium">browse</span>
                </span>
                <span className="text-[10px] text-sand-400">PDF · PPTX</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx"
              className="hidden"
              onChange={e => uploadFile(e.target.files[0])}
            />
          </div>
        </div>

        <div className="mx-4 mt-4 border-t border-sand-300" />

        {/* Document library */}
        <div className="px-4 pt-4 flex-1 overflow-y-auto min-h-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sand-500 mb-2.5">
            Your documents
            {uploadedFiles.length > 0 && (
              <span className="ml-1.5 font-normal normal-case tracking-normal text-sand-400">
                ({uploadedFiles.length})
              </span>
            )}
          </p>

          {uploadedFiles.length === 0 ? (
            <p className="text-xs text-sand-400 leading-relaxed">
              Nothing uploaded yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {uploadedFiles.map((doc, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 bg-sand-50 border border-sand-300 rounded-xl px-3 py-2.5"
                >
                  <FileIcon />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sand-800 truncate leading-snug">
                      {doc.name}
                    </p>
                    <p className="text-[10px] text-sand-400 mt-0.5">
                      {doc.type} · {doc.size} · {doc.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diagram hint */}
        <div className="px-4 pb-2 pt-3">
          <div className="border-t border-sand-300 mb-3" />
          <p className="text-[10px] text-sand-400 leading-relaxed text-center">
            💡 Try: <span className="italic">"Draw a diagram of..."</span>
          </p>
        </div>

        {/* Clear chat */}
        <div className="px-4 pb-5 pt-2">
          <button
            onClick={clearChat}
            className="w-full text-xs font-medium text-sand-600 bg-sand-50 hover:bg-sand-100 border border-sand-300 hover:border-sand-400 rounded-xl py-2.5 transition-all duration-150"
          >
            Clear chat
          </button>
        </div>
      </aside>

      {/* ── Chat area ── */}
      <main className="flex-1 flex flex-col min-w-0 bg-sand-50">

        {/* Header */}
        <div className="px-8 pt-7 pb-4 border-b border-sand-200">
          <h2 className="font-display text-xl font-semibold text-sand-800">Chat</h2>
          <p className="text-xs text-sand-400 mt-0.5">
            Ask anything about your uploaded documents
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4 min-h-0">
          {assessment && (
            <div className="bg-white border border-sand-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-sand-800">{assessment.title}</h3>
                  <p className="text-xs text-sand-400 mt-0.5">
                    {assessment.type === "exam" ? "Model Exam" : "MCQ Quiz"} · {assessment.questions.length} questions
                  </p>
                </div>
                {assessmentSubmitted && (
                  <div className="text-xs font-semibold text-sand-700 bg-sand-100 border border-sand-300 rounded-lg px-2.5 py-1">
                    Score: {score}/{assessment.questions.length}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {assessment.questions.map((q, qi) => (
                  <div key={qi} className="rounded-xl border border-sand-200 bg-sand-50 p-3">
                    <p className="text-sm font-medium text-sand-800">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      {q.options.map((opt, oi) => {
                        const selected = selectedAnswers[qi] === oi;
                        const isCorrect = q.correct_index === oi;
                        const reveal = assessmentSubmitted;
                        const classes = reveal
                          ? isCorrect
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : selected
                              ? "border-red-300 bg-red-50 text-red-800"
                              : "border-sand-200 bg-white text-sand-700"
                          : selected
                            ? "border-sand-500 bg-sand-100 text-sand-900"
                            : "border-sand-200 bg-white text-sand-700 hover:bg-sand-50";
                        return (
                          <button
                            key={oi}
                            disabled={assessmentSubmitted}
                            onClick={() => setSelectedAnswers(prev => ({ ...prev, [qi]: oi }))}
                            className={`text-left rounded-lg border px-3 py-2 text-xs transition-all ${classes} disabled:cursor-default`}
                          >
                            <span className="font-semibold mr-1.5">{String.fromCharCode(65 + oi)}.</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {assessmentSubmitted && (
                      <p className="mt-2 text-xs text-sand-600">
                        <span className="font-semibold">Explanation:</span> {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setAssessmentSubmitted(true)}
                  disabled={assessmentSubmitted || Object.keys(selectedAnswers).length < assessment.questions.length}
                  className="text-xs font-medium text-sand-50 bg-sand-700 hover:bg-sand-800 border border-sand-700 rounded-lg px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Submit answers
                </button>
                <button
                  onClick={() => {
                    setSelectedAnswers({});
                    setAssessmentSubmitted(false);
                  }}
                  className="text-xs font-medium text-sand-700 bg-sand-50 hover:bg-sand-100 border border-sand-300 rounded-lg px-3 py-2"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center pb-12">
              <p className="font-display text-lg text-sand-300 mb-1">No messages yet</p>
              <p className="text-xs text-sand-300">
                Upload a document and ask your first question.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`
                  max-w-[68%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                  ${msg.role === "user"
                    ? "bg-sand-700 text-sand-50 rounded-br-sm"
                    : "bg-white border border-sand-200 text-sand-800 rounded-bl-sm shadow-sm"}
                `}
              >
                <MessageContent
                  content={msg.content}
                  onZoomDiagram={setZoomedDiagramSvg}
                />
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-sand-200 rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm flex gap-1.5 items-center">
                {[0, 150, 300].map(delay => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-sand-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-8 pb-7 pt-3">
          <div className="flex items-center gap-3 bg-white border border-sand-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-sand-400 focus-within:shadow-md transition-all duration-200">
            <input
              className="flex-1 bg-transparent text-sm text-sand-800 placeholder:text-sand-400 outline-none font-sans"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask about your documents..."
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="w-8 h-8 rounded-xl bg-sand-700 hover:bg-sand-800 disabled:bg-sand-300 disabled:cursor-not-allowed flex items-center justify-center text-sand-50 transition-all duration-150 shrink-0"
            >
              <SendIcon />
            </button>
          </div>
          <p className="text-[10px] text-sand-400 text-center mt-2">
            Press Enter to send
          </p>
        </div>
      </main>

      {zoomedDiagramSvg && (
        <div
          className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8"
          onClick={() => setZoomedDiagramSvg("")}
        >
          <div
            className="relative h-full w-full rounded-xl bg-white shadow-2xl overflow-auto p-4 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomedDiagramSvg("")}
              className="sticky top-0 ml-auto block rounded-lg border border-sand-300 bg-sand-50 px-3 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-100"
            >
              Close
            </button>
            <div
              className="mt-3 min-h-[70vh] flex items-start justify-center"
              dangerouslySetInnerHTML={{ __html: zoomedDiagramSvg }}
            />
          </div>
        </div>
      )}
    </div>
  );
}