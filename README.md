# StudyBuddy

StudyBuddy is a document-based study assistant that lets you upload course files (`.pdf`, `.pptx`) and ask questions in chat using Retrieval-Augmented Generation (RAG).

It combines a FastAPI backend, a React frontend, local vector search with ChromaDB, and Groq-hosted LLM inference.

## Features

- Upload and index `PDF` and `PPTX` files.
- Ask questions grounded in your uploaded material.
- Session-based chat history for follow-up questions.
- Mermaid diagram rendering in chat responses.
- Click-to-zoom Mermaid diagrams in the UI.
- PPTX extraction includes:
  - text boxes and tables
  - speaker notes
  - basic chart structure/data when available
  - image presence and metadata (name/alt text)

## Tech Stack

- **Frontend:** React + Vite + TailwindCSS
- **Backend:** FastAPI
- **RAG / AI:** LangChain, ChromaDB, HuggingFace embeddings (`all-MiniLM-L6-v2`), Groq (`llama-3.3-70b-versatile`)
- **Parsers:** `pypdf`, `python-pptx`

## Project Structure

```text
StudyBuddy/
  backend/
    main.py           # FastAPI app and API routes
    rag.py            # document loading, indexing, retrieval chain
    requirements.txt
  frontend/
    src/App.jsx       # main UI and Mermaid rendering
    vite.config.js    # dev proxy /api -> backend
    package.json
  railway.toml
```

## How It Works

1. User uploads a file via the frontend.
2. Backend stores it in `backend/data/`.
3. Backend rebuilds a Chroma vector index from documents.
4. User asks a question in chat.
5. Retriever fetches relevant chunks.
6. LLM answers using retrieved context and conversation history.

## Local Setup

### 1) Clone and enter project

```bash
git clone <your-repo-url>
cd StudyBuddy
```

### 2) Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Run backend:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 3) Frontend setup

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://127.0.0.1:5173`.

## API Endpoints

- `GET /session` -> create new chat session id
- `POST /upload` -> upload and index one file (`multipart/form-data`)
- `POST /ask` -> ask a question with `session_id`

## Notes and Limitations

- Best results come from text-rich files.
- Visual-heavy slides (complex diagrams/photos) are only partially understood without a dedicated vision pipeline.
- Upload currently rebuilds the index from files in the data directory.
- Files are persisted locally; no auth/multi-user isolation yet.

## Deployment

- `railway.toml` is included for Railway deployment flow.
- For production, configure:
  - frontend/base URL behavior
  - backend CORS origins
  - environment variables (e.g., `GROQ_API_KEY`)

## Roadmap Ideas

- Add multimodal slide understanding (OCR + vision model).
- Add user auth and per-user document spaces.
- Incremental indexing (avoid full rebuild per upload).
- Source citations with page/slide-level grounding in UI.
- Better evals and regression tests for answer quality.

## License

Add your preferred license (e.g., MIT) in a `LICENSE` file.
