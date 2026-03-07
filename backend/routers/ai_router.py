"""AI router — Gemini API integration for risk narrative generation."""
from __future__ import annotations
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

class AIAnalysisRequest(BaseModel):
    module: str          # "aviation" | "maritime" | "railway"
    risk_score: float
    risk_level: str
    origin: str
    destination: str
    top_factors: list[dict]
    api_key: str | None = None   # optional override; else use env var


class AIChatRequest(BaseModel):
    question: str
    context: dict | None = None
    api_key: str | None = None


class ScenarioRequest(BaseModel):
    transport_mode: str
    origin: str
    destination: str
    cargo_type: str
    cargo_value: float
    departure_date: str
    risk_event: str | None = None
    api_key: str | None = None

class AIResponse(BaseModel):
    summary: str
    generated_by: str   # "gemini" | "template"


class ScenarioResponse(BaseModel):
    overall_risk_score: float = 0
    risk_level: str = ""
    risk_breakdown: dict = {}
    estimated_loss_exposure: str = ""
    recommended_coverage: list[str] = []
    coverage_gaps: list[str] = []
    recommended_actions: list[str] = []
    executive_summary: str = ""
    raw_text: str | None = None
    error: str | None = None



import requests

@router.post("/analyze", response_model=AIResponse)
def ai_analyze(req: AIAnalysisRequest):
    api_key = req.api_key or os.getenv("GROQ_API_KEY", "")
    factors_text = "\n".join(
        f"- {f['name']} (+{f['delta']} pts): {f['description']}" for f in req.top_factors
    )
    prompt = (
        f"You are GlobalRisk's senior underwriting AI. Provide a highly concise, punchy, and professional "
        f"risk intelligence summary for a {req.module} shipment from {req.origin} to {req.destination}.\n"
        f"Overall risk score: {req.risk_score}/100 ({req.risk_level}).\n"
        f"Top risk drivers:\n{factors_text}\n\n"
        f"Format your response EXACTLY as 3 short paragraphs. DO NOT use bullet points. DO NOT use introductory filler. \n"
        f"Use bold markdown (**text**) for key metrics, locations, and critical threat concepts.\n\n"
        f"Paragraph 1: Executive summary of the route's overall risk profile (max 2 sentences).\n"
        f"Paragraph 2: Key threats and direct underwriting implications (max 3 sentences).\n"
        f"Paragraph 3: Specific, actionable risk mitigations to lower the premium (max 2 sentences).\n"
        f"Keep language professional, highly concentrated, and strictly in the present tense."
    )

    if api_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.4
            }
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                data = res.json()
                text = data["choices"][0]["message"]["content"]
                return AIResponse(summary=text, generated_by="groq")
            else:
                try:
                    err_msg = res.json().get("error", {}).get("message", res.text)
                except:
                    err_msg = res.text
                return AIResponse(summary=f"Groq API Error: {err_msg}", generated_by="error")
        except Exception as e:
            return AIResponse(summary=f"Internal Server Error: {str(e)}", generated_by="error")

    # Template fallback
    template = (
        f"The {req.module} route from **{req.origin}** to **{req.destination}** has been assessed "
        f"at a risk score of **{req.risk_score}/100**, classified as **{req.risk_level}**. "
        f"The primary risk driver is {req.top_factors[0]['name'] if req.top_factors else 'operational factors'}, "
        f"contributing significantly to the overall exposure.\n\n"
        f"Key underwriting concerns include active threat zones along the route and adverse "
        f"environmental conditions. These factors collectively increase the base risk loading "
        f"and may require additional policy conditions or exclusions.\n\n"
        f"Risk mitigation recommendations include rerouting to avoid high-threat zones, "
        f"implementing enhanced monitoring protocols, and engaging qualified security consultants "
        f"where applicable."
    )
    return AIResponse(summary=template, generated_by="template")


@router.post("/chat", response_model=AIResponse)
def ai_chat(req: AIChatRequest):
    api_key = req.api_key or os.getenv("GROQ_API_KEY", "")
    if api_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            system = (
                "You are GlobalRisk's AI intelligence analyst. Answer questions about aviation, "
                "maritime, and railway risk for insurance underwriters. Be concise, punchy, and professional.\n"
                "Format recommendations: Use bolding for precise terminology, locations, or key concepts. "
                "Keep answers structurally organized, prioritizing immediate underwriting insights."
            )
            payload = {
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": req.question}
                ],
                "temperature": 0.4
            }
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                data = res.json()
                text = data["choices"][0]["message"]["content"]
                return AIResponse(summary=text, generated_by="groq")
            else:
                try:
                    err_msg = res.json().get("error", {}).get("message", res.text)
                except:
                    err_msg = res.text
                return AIResponse(summary=f"Groq API Error: {err_msg}", generated_by="error")
        except Exception as e:
            return AIResponse(summary=f"Internal Server Error: {str(e)}", generated_by="error")
            
    return AIResponse(
        summary="Please configure your Groq API key in the AI Command Center to enable live AI responses.",
        generated_by="template"
    )

@router.post("/simulate-scenario", response_model=ScenarioResponse)
def ai_simulate_scenario(req: ScenarioRequest):
    import json
    api_key = req.api_key or os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return ScenarioResponse(error="GROQ_API_KEY not configured. Please set the API key.")
        
    try:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        event_str = f"Specific Risk Event: {req.risk_event}" if req.risk_event else "No specific overriding event; general transport risk assessment."
        
        prompt = (
            "You are a global risk intelligence AI specializing in cargo transport insurance underwriting.\n"
            f"Analyze the following shipment and return exactly one JSON object with the strict keys requested.\n\n"
            f"Shipment Details:\n"
            f"- Transport Mode: {req.transport_mode}\n"
            f"- Origin: {req.origin}\n"
            f"- Destination: {req.destination}\n"
            f"- Cargo Type: {req.cargo_type}\n"
            f"- Cargo Value (USD): ${req.cargo_value:,.2f}\n"
            f"- Departure Date: {req.departure_date}\n"
            f"- {event_str}\n\n"
            "Respond ONLY with a valid JSON object matching this structure EXACTLY:\n"
            "{\n"
            "  \"overall_risk_score\": 75,\n"
            "  \"risk_level\": \"High\",\n"
            "  \"risk_breakdown\": {\n"
            "    \"weather_risk\": 40,\n"
            "    \"geopolitical_risk\": 85,\n"
            "    \"piracy_risk\": 20,\n"
            "    \"infrastructure_risk\": 60,\n"
            "    \"cargo_specific_risk\": 50\n"
            "  },\n"
            "  \"estimated_loss_exposure\": \"$2.4M at risk\",\n"
            "  \"recommended_coverage\": [\"Marine Cargo Insurance\", \"War Risk Cover\"],\n"
            "  \"coverage_gaps\": [\"Standard cargo policy excludes strike actions at port\"],\n"
            "  \"recommended_actions\": [\"Action 1\", \"Action 2\"],\n"
            "  \"executive_summary\": \"Provide a 3-5 sentence underwriting executive summary...\"\n"
            "}\n"
        )
        
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "You are a specialized risk analysis AI that only outputs valid JSON data. No markdown fences around JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }
        
        res = requests.post(url, headers=headers, json=payload, timeout=20)
        if res.status_code == 200:
            data = res.json()
            text = data["choices"][0]["message"]["content"]
            try:
                result = json.loads(text)
                return ScenarioResponse(**result)
            except json.JSONDecodeError:
                # Fallback to returning the raw text if JSON is malformed
                return ScenarioResponse(raw_text=text, error="Failed to parse structured JSON from AI output.")
        else:
            try:
                err_msg = res.json().get("error", {}).get("message", res.text)
            except:
                err_msg = res.text
            return ScenarioResponse(error=f"Groq API Error: {err_msg}")
    except Exception as e:
        return ScenarioResponse(error=f"Internal Server Error: {str(e)}")
