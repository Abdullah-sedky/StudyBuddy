import gc
import os
import uuid
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag import build_chain, create_study_brain, release_study_brain, generate_assessment, invoke_chain 
app = FastAPI()

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://study-buddy-five-gamma.vercel.app"
]


def _allowed_origins_from_env() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return DEFAULT_ALLOWED_ORIGINS
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or DEFAULT_ALLOWED_ORIGINS


ALLOWED_ORIGINS = _allowed_origins_from_env()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

CHROMA_RUNS_DIR = "./chroma_runs"
ACTIVE_CHROMA_FILE = os.path.join(CHROMA_RUNS_DIR, "active.txt")


def _read_active_persist_dir() -> str | None:
    if not os.path.isfile(ACTIVE_CHROMA_FILE):
        return None
    try:
        with open(ACTIVE_CHROMA_FILE, encoding="utf-8") as f:
            path = f.read().strip()
        if path and os.path.isdir(path) and os.listdir(path):
            return path
    except OSError:
        pass
    return None


def _startup_persist_dir() -> str:
    """Prefer last good versioned store; fall back to legacy ./chroma_db."""
    active = _read_active_persist_dir()
    if active:
        return active
    legacy = "./chroma_db"
    if os.path.isdir(legacy) and os.listdir(legacy):
        return legacy
    return legacy


def _prune_stale_chroma_runs(keep_dir: str | None) -> None:
    """Remove old chroma_runs/* folders (nothing should hold them at process start)."""
    if not os.path.isdir(CHROMA_RUNS_DIR):
        return
    keep_abs = os.path.abspath(keep_dir) if keep_dir else None
    for name in os.listdir(CHROMA_RUNS_DIR):
        if name == "active.txt":
            continue
        full = os.path.join(CHROMA_RUNS_DIR, name)
        if not os.path.isdir(full):
            continue
        if keep_abs and os.path.abspath(full) == keep_abs:
            continue
        try:
            shutil.rmtree(full)
        except OSError as e:
            print(f"Could not remove stale index {full}: {e}")


def _persist_dir_for_new_index() -> str:
    os.makedirs(CHROMA_RUNS_DIR, exist_ok=True)
    new_dir = os.path.join(CHROMA_RUNS_DIR, uuid.uuid4().hex)
    os.makedirs(new_dir, exist_ok=True)
    return new_dir


def _write_active_persist_dir(path: str) -> None:
    os.makedirs(CHROMA_RUNS_DIR, exist_ok=True)
    with open(ACTIVE_CHROMA_FILE, "w", encoding="utf-8") as f:
        f.write(path)


# ---------- Startup ----------

_persist = _startup_persist_dir()
_prune_stale_chroma_runs(_persist if os.path.isdir(_persist) and os.listdir(_persist) else None)

try:
    print("Loading existing vector store on startup...")
    retriever = create_study_brain("./data", persist_dir=_persist)
    chain = build_chain(retriever)
    print("Chain ready.")
except ValueError:
    print("No documents found on startup. Waiting for upload.")
    retriever = None
    chain = None

# ---------- Request Models ----------

class AskRequest(BaseModel):
    question: str
    session_id: str

class AskResponse(BaseModel):
    answer: str
    session_id: str


class AssessmentRequest(BaseModel):
    session_id: str
    kind: str = "mcq"
    num_questions: int = 8
    topic: str = ""

# ---------- Endpoints ----------

@app.get("/session")
def new_session():
    return {"session_id": str(uuid.uuid4())}


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest):
    if chain is None:
        raise HTTPException(
            status_code=400,
            detail="No documents uploaded yet. Please upload a file first."
        )
    try:
        answer = invoke_chain(chain, request.question, request.session_id)
        return AskResponse(answer=answer, session_id=request.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global chain, retriever

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".pptx"]:
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are allowed.")

    os.makedirs("./data", exist_ok=True)
    file_path = f"./data/{file.filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    chain = None
    gc.collect()
    release_study_brain()

    new_persist = _persist_dir_for_new_index()
    try:
        retriever = create_study_brain("./data", persist_dir=new_persist)
        chain = build_chain(retriever)
        _write_active_persist_dir(new_persist)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

    return {"message": f"{file.filename} uploaded and indexed successfully."}


@app.post("/assessment")
async def create_assessment(request: AssessmentRequest):
    if chain is None or retriever is None:
        raise HTTPException(
            status_code=400,
            detail="No documents uploaded yet. Please upload a file first."
        )
    kind = request.kind.lower().strip()
    if kind not in ["mcq", "exam"]:
        raise HTTPException(status_code=400, detail="kind must be 'mcq' or 'exam'")

    try:
        payload = generate_assessment(
            retriever,
            assessment_type=kind,
            num_questions=request.num_questions,
            topic=request.topic,
        )
        payload["session_id"] = request.session_id
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate assessment: {str(e)}")