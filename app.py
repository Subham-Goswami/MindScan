"""
MindScan — FastAPI backend
===========================
Serves the MindScan mental-wellness self-assessment website (HTML / CSS / JS,
rendered through Jinja2 templates) and hosts the trained Logistic Regression
depression-prediction model.

This file replaces the old React / TanStack Start frontend entirely. There is
no Node.js, npm, Vite, or JSX/TSX anywhere in this project any more — the UI
is plain HTML templates + static CSS/JS, served directly by FastAPI.

Run with:
    uvicorn app:app --reload

Then open:
    http://127.0.0.1:8000
"""

from pathlib import Path
from uuid import uuid4

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "depression_logistic_regression_model.joblib"

# ---------------------------------------------------------------------------
# Load the trained ML model (unchanged from the original HealthCode backend)
# ---------------------------------------------------------------------------
model = joblib.load(MODEL_PATH)
feature_columns = list(model.named_steps["preprocessor"].feature_names_in_)

app = FastAPI(
    title="MindScan — Depression Prediction API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Static assets (CSS / JS / images) and Jinja2 HTML templates
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


# ---------------------------------------------------------------------------
# Optional step-by-step questionnaire flow (kept from the original backend,
# useful for programmatic / API-only clients). The MindScan website itself
# talks directly to /predict once all questions are answered in the browser.
# ---------------------------------------------------------------------------
QUESTION_FLOW = [
    {"field": "gender", "question": "Enter Gender", "allowed_answers": ["M", "F"], "help": "M = Male, F = Female"},
    {"field": "age", "question": "Enter Age", "allowed_answers": "number from 10 to 100"},
    {"field": "sadness", "question": "I often feel sad or emotionally low", "allowed_answers": [0, 1, 2, 3]},
    {"field": "tiredness", "question": "I feel tired or lack energy during the day", "allowed_answers": [0, 1, 2, 3]},
    {"field": "sleep_problem", "question": "I experience difficulty sleeping or disturbed sleep", "allowed_answers": [0, 1, 2, 3]},
    {"field": "hopelessness", "question": "I feel uncertain or hopeless about the future", "allowed_answers": [0, 1, 2, 3]},
    {"field": "lost_interest", "question": "I have lost interest in activities I usually enjoy", "allowed_answers": [0, 1, 2, 3]},
    {"field": "concentration_problem", "question": "I find it difficult to concentrate on tasks", "allowed_answers": [0, 1, 2, 3]},
    {"field": "anxiety", "question": "I frequently feel anxious or worried", "allowed_answers": [0, 1, 2, 3]},
    {"field": "loneliness", "question": "I often feel lonely or emotionally disconnected", "allowed_answers": [0, 1, 2, 3]},
    {"field": "guilt", "question": "I blame myself or feel guilty without strong reason", "allowed_answers": [0, 1, 2, 3]},
    {"field": "mood_changes", "question": "I experience frequent mood changes", "allowed_answers": [0, 1, 2, 3]},
    {"field": "suicidal_thoughts", "question": "I experience suicidal thoughts", "allowed_answers": [0, 1, 2, 3]},
    {"field": "study_pressure", "question": "I feel pressure from work or studies", "allowed_answers": [0, 1, 2, 3]},
]

SCORE_HELP = "For symptom questions: 0 = Never, 1 = Sometimes, 2 = Often, 3 = Always"
sessions = {}


# ---------------------------------------------------------------------------
# Request / response models (unchanged from the original backend)
# ---------------------------------------------------------------------------
class QuestionnaireRequest(BaseModel):
    gender: str = Field(..., pattern="^(M|F|m|f)$")
    age: float = Field(..., ge=10, le=100)
    sadness: int = Field(..., ge=0, le=3)
    tiredness: int = Field(..., ge=0, le=3)
    sleep_problem: int = Field(..., ge=0, le=3)
    hopelessness: int = Field(..., ge=0, le=3)
    lost_interest: int = Field(..., ge=0, le=3)
    concentration_problem: int = Field(..., ge=0, le=3)
    anxiety: int = Field(..., ge=0, le=3)
    loneliness: int = Field(..., ge=0, le=3)
    guilt: int = Field(..., ge=0, le=3)
    mood_changes: int = Field(..., ge=0, le=3)
    suicidal_thoughts: int = Field(..., ge=0, le=3)
    study_pressure: int = Field(..., ge=0, le=3)


class QuestionnaireAnswer(BaseModel):
    session_id: str
    answer: str


def get_question(index: int):
    question = QUESTION_FLOW[index]
    response = {
        "question_number": index + 1,
        "total_questions": len(QUESTION_FLOW),
        "field": question["field"],
        "question": question["question"],
        "allowed_answers": question["allowed_answers"],
    }
    if index >= 2:
        response["help"] = SCORE_HELP
    elif "help" in question:
        response["help"] = question["help"]
    return response


def validate_answer(field: str, answer: str):
    value = answer.strip()

    if field == "gender":
        value = value.upper()
        if value not in {"M", "F"}:
            raise HTTPException(status_code=400, detail="Gender must be M or F.")
        return value

    if field == "age":
        try:
            age = float(value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Age must be a number.") from exc
        if age < 10 or age > 100:
            raise HTTPException(status_code=400, detail="Age must be from 10 to 100.")
        return age

    try:
        score = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Answer must be 0, 1, 2, or 3.") from exc

    if score not in {0, 1, 2, 3}:
        raise HTTPException(status_code=400, detail="Answer must be 0, 1, 2, or 3.")
    return score


# ---------------------------------------------------------------------------
# Core ML prediction logic (unchanged from the original backend)
# ---------------------------------------------------------------------------
def make_prediction(payload: QuestionnaireRequest):
    sample = build_profile(payload)
    depressed_score = float(model.predict_proba(sample)[0][1] * 100)

    if depressed_score < 40:
        risk_level = "low"
    elif depressed_score < 70:
        risk_level = "moderate"
    else:
        risk_level = "high"

    return {
        "depressed_score": round(depressed_score, 2),
        "not_depressed_score": round(100 - depressed_score, 2),
        "risk_level": risk_level,
        "high_priority_support_note": payload.suicidal_thoughts >= 2,
        "message": "This is an academic self-assessment result, not a medical diagnosis.",
    }


def build_profile(payload: QuestionnaireRequest) -> pd.DataFrame:
    data = {column: 0 for column in feature_columns}
    pressure = payload.study_pressure + 1
    total_symptom_score = sum(
        [
            payload.sadness,
            payload.tiredness,
            payload.sleep_problem,
            payload.hopelessness,
            payload.lost_interest,
            payload.concentration_problem,
            payload.anxiety,
            payload.loneliness,
            payload.guilt,
            payload.mood_changes,
            payload.suicidal_thoughts,
        ]
    )

    data.update(
        {
            "Gender": "Male" if payload.gender.upper() == "M" else "Female",
            "Age": payload.age,
            "City": "Unknown",
            "Profession": "Student",
            "Academic Pressure": float(min(5, max(1, pressure))),
            "Work Pressure": 0.0,
            "CGPA": 7.0,
            "Study Satisfaction": float(max(1, 5 - pressure)),
            "Job Satisfaction": 0.0,
            "Sleep Duration": (
                "Less than 5 hours"
                if payload.sleep_problem >= 2 or payload.tiredness >= 2
                else "7-8 hours"
            ),
            "Dietary Habits": (
                "Unhealthy"
                if total_symptom_score >= 22
                else "Moderate"
                if total_symptom_score >= 12
                else "Healthy"
            ),
            "Degree": "Unknown",
            "Have you ever had suicidal thoughts ?": (
                "Yes" if payload.suicidal_thoughts >= 2 else "No"
            ),
            "Work/Study Hours": float(
                min(12, 2 + pressure + payload.tiredness + payload.concentration_problem)
            ),
            "Financial Stress": float(min(5, max(1, pressure))),
            "Family History of Mental Illness": "No",
        }
    )

    return pd.DataFrame([data])[feature_columns]


# ---------------------------------------------------------------------------
# Website routes — the entire MindScan flow (Home → About You → Questionnaire
# → Mood → Result → Recommendations) lives on a single page, exactly as it
# did in the React version, driven by static/js/app.js.
# ---------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "request": request,
            "title": "MindScan — Mental Wellness Self-Assessment",
            "description": "Private 5-minute wellness check covering mood, sleep, energy, and more. Not a medical diagnosis.",
        },
    )


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@app.post("/questionnaire/start")
def start_questionnaire():
    session_id = str(uuid4())
    sessions[session_id] = {"current_index": 0, "answers": {}}
    return {
        "session_id": session_id,
        "status": "started",
        "instruction": "Send this session_id and the customer's answer to /questionnaire/answer.",
        "next_question": get_question(0),
    }


@app.post("/questionnaire/answer")
def answer_question(payload: QuestionnaireAnswer):
    session = sessions.get(payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found. Start a new questionnaire.")

    current_index = session["current_index"]
    if current_index >= len(QUESTION_FLOW):
        return {
            "session_id": payload.session_id,
            "status": "completed",
            "result": session["result"],
        }

    question = QUESTION_FLOW[current_index]
    value = validate_answer(question["field"], payload.answer)
    session["answers"][question["field"]] = value
    session["current_index"] += 1

    if session["current_index"] < len(QUESTION_FLOW):
        return {
            "session_id": payload.session_id,
            "status": "in_progress",
            "saved_answer_for": question["field"],
            "next_question": get_question(session["current_index"]),
        }

    request_obj = QuestionnaireRequest(**session["answers"])
    result = make_prediction(request_obj)
    session["result"] = result
    return {
        "session_id": payload.session_id,
        "status": "completed",
        "result": result,
    }


@app.post("/predict")
def predict(payload: QuestionnaireRequest):
    return make_prediction(payload)
