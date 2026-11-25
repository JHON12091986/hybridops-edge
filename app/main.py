from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(
    title="HybridOps Edge API",
    description="High-throughput Python FastAPI backend for SLA risk scoring, hybrid inference telemetry, and audit logs.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TriageRecordIn(BaseModel):
    ticket_id: str = Field(..., min_length=2, max_length=64)
    title: str = Field(..., min_length=3, max_length=200)
    raw_input: str = Field(..., min_length=5, max_length=12000)
    ai_summary: str = Field(..., min_length=3, max_length=6000)
    recommended_action: str = Field(..., min_length=3, max_length=3000)
    execution_source: Literal["on-device", "cloud", "simulated-fallback"]
    latency_ms: float = Field(..., ge=0.0)
    business_blocked: bool = False
    sla_minutes_remaining: int = Field(default=60, ge=0, le=10080)


class TriageRecordOut(TriageRecordIn):
    id: str
    urgency_score: float
    sla_risk_level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    created_at: str


TRIAGE_STORE: list[TriageRecordOut] = []


def compute_sla_risk(
    business_blocked: bool,
    sla_minutes_remaining: int,
    text_length: int,
) -> tuple[float, Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]]:
    blockage_factor = 1.0 if business_blocked else 0.25
    if sla_minutes_remaining <= 30:
        sla_proximity = 1.0
    elif sla_minutes_remaining <= 120:
        sla_proximity = 0.75
    elif sla_minutes_remaining <= 480:
        sla_proximity = 0.45
    else:
        sla_proximity = 0.20

    complexity_bonus = 0.10 if text_length > 800 else 0.0
    score = min(1.0, round(0.55 * blockage_factor + 0.35 * sla_proximity + complexity_bonus, 3))

    if score >= 0.80:
        level: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"] = "CRITICAL"
    elif score >= 0.60:
        level = "HIGH"
    elif score >= 0.40:
        level = "MEDIUM"
    else:
        level = "LOW"

    return score, level


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "HybridOps Edge Backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/triage", response_model=TriageRecordOut)
def save_triage_record(payload: TriageRecordIn) -> TriageRecordOut:
    score, level = compute_sla_risk(
        business_blocked=payload.business_blocked,
        sla_minutes_remaining=payload.sla_minutes_remaining,
        text_length=len(payload.raw_input),
    )
    record = TriageRecordOut(
        **payload.model_dump(),
        id=str(uuid4()),
        urgency_score=score,
        sla_risk_level=level,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    TRIAGE_STORE.insert(0, record)
    return record


@app.get("/api/triage", response_model=list[TriageRecordOut])
def list_triage_records(limit: int = 25) -> list[TriageRecordOut]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    return TRIAGE_STORE[:limit]


@app.get("/api/metrics")
def get_hybrid_metrics() -> dict[str, object]:
    total = len(TRIAGE_STORE)
    if total == 0:
        return {
            "total_triaged": 0,
            "on_device_count": 0,
            "cloud_count": 0,
            "on_device_ratio_pct": 0.0,
            "avg_on_device_latency_ms": 0.0,
            "avg_cloud_latency_ms": 0.0,
            "critical_sla_count": 0,
        }

    on_device = [r for r in TRIAGE_STORE if r.execution_source == "on-device"]
    cloud = [r for r in TRIAGE_STORE if r.execution_source != "on-device"]
    critical = [r for r in TRIAGE_STORE if r.sla_risk_level == "CRITICAL"]

    avg_od = round(sum(r.latency_ms for r in on_device) / len(on_device), 2) if on_device else 0.0
    avg_cl = round(sum(r.latency_ms for r in cloud) / len(cloud), 2) if cloud else 0.0

    return {
        "total_triaged": total,
        "on_device_count": len(on_device),
        "cloud_count": len(cloud),
        "on_device_ratio_pct": round((len(on_device) / total) * 100, 1),
        "avg_on_device_latency_ms": avg_od,
        "avg_cloud_latency_ms": avg_cl,
        "critical_sla_count": len(critical),
    }


@app.get("/api/export")
def export_audit_json() -> JSONResponse:
    return JSONResponse(
        content={
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "count": len(TRIAGE_STORE),
            "records": [r.model_dump() for r in TRIAGE_STORE],
        }
    )


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
