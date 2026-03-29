"""Tool-Definitionen — aufgeteilt nach Kategorie."""
from services.tools.defs.transport import SBB_TOOL_DEFS
from services.tools.defs.web import WEB_FETCH_TOOL_DEFS, WEB_SEARCH_TOOL_DEFS, BROWSER_TOOL_DEFS
from services.tools.defs.images import DALLE_TOOL_DEFS, UNSPLASH_TOOL_DEFS
from services.tools.defs.stocks import (
    STOCK_TOOL_DEFS, STOCK_ALERT_TOOL_DEFS,
    PORTFOLIO_TOOL_DEFS, DASHBOARD_TOOL_DEFS,
)
from services.tools.defs.misc import TRAINING_REMINDER_TOOL_DEFS, WEATHER_TOOL_DEFS

__all__ = [
    "SBB_TOOL_DEFS",
    "WEB_FETCH_TOOL_DEFS", "WEB_SEARCH_TOOL_DEFS", "BROWSER_TOOL_DEFS",
    "DALLE_TOOL_DEFS", "UNSPLASH_TOOL_DEFS",
    "STOCK_TOOL_DEFS", "STOCK_ALERT_TOOL_DEFS", "PORTFOLIO_TOOL_DEFS", "DASHBOARD_TOOL_DEFS",
    "TRAINING_REMINDER_TOOL_DEFS", "WEATHER_TOOL_DEFS",
]
