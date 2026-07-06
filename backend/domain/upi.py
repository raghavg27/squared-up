"""UPI intent deep links. Spec §7.2.

Squared Up never touches money — only constructs the link; licensed UPI apps
move funds.
"""

from urllib.parse import urlencode


def paise_to_rupee_string(paise: int) -> str:
    """Format paise as rupees with 2 decimals for UPI ``am`` field. Spec §7.2."""
    if not isinstance(paise, int) or isinstance(paise, bool):
        raise ValueError("paise_to_rupee_string: non-integer paise")
    neg = paise < 0
    abs_p = abs(paise)
    rupees = abs_p // 100
    p = abs_p % 100
    return f"{'-' if neg else ''}{rupees}.{p:02d}"


def build_upi_intent(
    vpa: str | None,
    payee_name: str,
    amount_paise: int,
    note: str | None = None,
) -> str | None:
    """Build a standard UPI intent deep link. Returns None if no VPA on file
    (falls back to manual).
    """
    if not vpa:
        return None
    am = paise_to_rupee_string(amount_paise)
    params = {
        "pa": vpa,
        "pn": payee_name,
        "am": am,
        "cu": "INR",
        "tn": note or "Squared Up",
    }
    return "upi://pay?" + urlencode(params)
