import json
from datetime import datetime, timezone


class RequestLogMiddleware:
    """Structured request log (PRD §8 observability)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print(
            json.dumps(
                {
                    "t": datetime.now(timezone.utc).isoformat(),
                    "method": request.method,
                    "path": request.path,
                }
            )
        )
        return self.get_response(request)
