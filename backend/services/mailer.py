"""
Outbound email — one function, two transports, chosen by whatever you configure.

You do not have to decide up front. Set the env vars for ONE of these:

  A) Resend  (recommended on Vercel)
       RESEND_API_KEY=re_xxxxxxxx
       MAIL_FROM="Valyze <reports@yourdomain.com>"
     Works over plain HTTPS, so it is immune to the blocked-SMTP-port problem
     below. Free tier covers a few thousand sends a month. You must verify your
     sending domain in the Resend dashboard first.

  B) SMTP  (use the email account you already own)
       SMTP_HOST=smtp.hostinger.com      # or smtp.gmail.com, smtp.office365.com
       SMTP_PORT=587
       SMTP_USER=reports@yourdomain.com
       SMTP_PASSWORD=...                 # Gmail/Outlook need an APP PASSWORD,
                                         # not your normal login password
       MAIL_FROM="Valyze <reports@yourdomain.com>"

⚠️ Serverless caveat: many serverless platforms (Vercel included) throttle or
block outbound SMTP on ports 25/465/587. If SMTP times out in production but
works on your machine, that is the cause — switch to Resend. This is exactly why
transport A exists.

Nothing here reads a hardcoded credential. Set the env vars in your deployment
dashboard; this module only reads them.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def mail_from() -> str:
    return os.getenv("MAIL_FROM", "").strip()


def configured_transport() -> Optional[str]:
    """Which transport is usable right now: 'resend', 'smtp', or None."""
    if not mail_from():
        return None
    if os.getenv("RESEND_API_KEY", "").strip():
        return "resend"
    if all(os.getenv(k, "").strip() for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD")):
        return "smtp"
    return None


def transport_status() -> Dict[str, Any]:
    """Human-readable config state for the admin UI. Never leaks a secret —
    reports only whether each var is present."""
    transport = configured_transport()
    return {
        "transport": transport,
        "ready": transport is not None,
        "mail_from_set": bool(mail_from()),
        "resend_key_set": bool(os.getenv("RESEND_API_KEY", "").strip()),
        "smtp_host_set": bool(os.getenv("SMTP_HOST", "").strip()),
        "smtp_user_set": bool(os.getenv("SMTP_USER", "").strip()),
        "smtp_password_set": bool(os.getenv("SMTP_PASSWORD", "").strip()),
        "hint": _hint(transport),
    }


def _hint(transport: Optional[str]) -> str:
    if transport:
        return f"Sending via {transport}."
    if not mail_from():
        return "Set MAIL_FROM, e.g. 'Valyze <reports@yourdomain.com>'."
    return (
        "Set RESEND_API_KEY (recommended on Vercel), or SMTP_HOST + SMTP_USER + "
        "SMTP_PASSWORD to use an email account you already own."
    )


def _send_via_resend(
    to: List[str], subject: str, html: str, attachments: List[Tuple[str, bytes]]
) -> None:
    payload: Dict[str, Any] = {
        "from": mail_from(),
        "to": to,
        "subject": subject,
        "html": html,
    }
    if attachments:
        import base64
        payload["attachments"] = [
            {"filename": name, "content": base64.b64encode(blob).decode("ascii")}
            for name, blob in attachments
        ]

    resp = requests.post(
        RESEND_ENDPOINT,
        headers={
            "Authorization": f"Bearer {os.getenv('RESEND_API_KEY', '').strip()}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    if resp.status_code >= 400:
        # Log the upstream body server-side; never return it to the caller —
        # it can echo back address and domain details.
        logger.error(f"[MAILER] Resend rejected the send: {resp.status_code} {resp.text[:300]}")
        raise RuntimeError("The email provider rejected the message.")


def _send_via_smtp(
    to: List[str], subject: str, html: str, attachments: List[Tuple[str, bytes]]
) -> None:
    msg = EmailMessage()
    msg["From"] = mail_from()
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content("This message requires an HTML-capable email client.")
    msg.add_alternative(html, subtype="html")

    for name, blob in attachments:
        msg.add_attachment(
            blob, maintype="application", subtype="octet-stream", filename=name
        )

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")

    context = ssl.create_default_context()
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
                server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=30) as server:
                server.starttls(context=context)
                server.login(user, password)
                server.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        logger.error("[MAILER] SMTP rejected the credentials for %s", user)
        raise RuntimeError(
            "The mail server rejected the login. If this is Gmail or Outlook, you need an "
            "app password, not the account's normal password."
        )
    except (smtplib.SMTPException, OSError) as exc:
        logger.error(f"[MAILER] SMTP send failed via {host}:{port} — {exc}")
        raise RuntimeError(
            "Could not reach the mail server. On serverless hosting, outbound SMTP ports are "
            "often blocked — set RESEND_API_KEY instead."
        )


def send_email(
    to: List[str],
    subject: str,
    html: str,
    attachments: Optional[List[Tuple[str, bytes]]] = None,
) -> str:
    """Send one email. Returns the transport used. Raises RuntimeError with a
    message safe to show a user."""
    recipients = [a.strip() for a in to if a and a.strip()]
    if not recipients:
        raise RuntimeError("No recipient address.")

    transport = configured_transport()
    if transport is None:
        raise RuntimeError(_hint(None))

    attachments = attachments or []
    if transport == "resend":
        _send_via_resend(recipients, subject, html, attachments)
    else:
        _send_via_smtp(recipients, subject, html, attachments)

    logger.info(f"[MAILER] Sent '{subject}' to {len(recipients)} recipient(s) via {transport}")
    return transport
