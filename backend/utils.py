def get_risk_level(score: float) -> str:
    """
    Convert a 0-100 risk score into a nominal risk level string.
    """
    if score < 30: return "LOW"
    if score < 55: return "ELEVATED"
    if score < 75: return "HIGH"
    return "CRITICAL"
