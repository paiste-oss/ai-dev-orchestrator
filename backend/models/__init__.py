"""Models-Paket — eager-imported alle Module damit SQLAlchemy beim ersten
Mapper-Aufruf alle Forward-Referenzen (z.B. Mapped["DeviceToken"]) auflösen
kann. Wichtig für Celery-Worker: ohne das knallt eine Customer-Query mit
'expression DeviceToken failed to locate a name'.
"""
# Side-effect imports — registriert alle Tabellen bei Base.metadata
from . import customer  # noqa: F401
from . import buddy  # noqa: F401
from . import workflow  # noqa: F401
from . import credential  # noqa: F401
from . import dev_task  # noqa: F401
from . import document  # noqa: F401
from . import buddy_event  # noqa: F401
from . import capability_request  # noqa: F401
from . import chat  # noqa: F401
from . import content_guard_log  # noqa: F401
from . import daily_summary  # noqa: F401
from . import device_token  # noqa: F401
from . import document_folder  # noqa: F401
from . import email_message  # noqa: F401
from . import finance  # noqa: F401
from . import knowledge  # noqa: F401
from . import literature_entry  # noqa: F401
from . import literature_global_index  # noqa: F401
from . import book_global_index  # noqa: F401
from . import law_global_index  # noqa: F401
from . import literature_group  # noqa: F401
from . import literature_orphan_pdf  # noqa: F401
from . import payment  # noqa: F401
from . import stock_alert  # noqa: F401
from . import stock_portfolio  # noqa: F401
from . import support_ticket  # noqa: F401
from . import training_reminder  # noqa: F401
from . import window  # noqa: F401

# Public re-exports (alte Aufrufer wie `from models import Customer`)
from .customer import Customer, SubscriptionPlan
from .buddy import AiBuddy
from .workflow import N8nWorkflow
from .credential import CustomerCredential
from .dev_task import DevTask
from .document import CustomerDocument
from .buddy_event import BuddyEvent

__all__ = [
    "Customer", "SubscriptionPlan",
    "AiBuddy",
    "N8nWorkflow",
    "CustomerCredential",
    "DevTask",
    "CustomerDocument",
    "BuddyEvent",
]
