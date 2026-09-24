"""
CPI Certificate Expiry Monitor
Checks keystores across DEV and TEST tenants, posts Teams alert if anything
is EXPIRED or expiring within 90 days.
Run via Windows Task Scheduler every Monday morning.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
CONFIG_FILE = Path(__file__).parent / "cert_monitor_config.json"

THRESHOLDS = {
    "expired":  0,
    "critical": 30,
    "warning":  90,
}

ALIAS_USAGE = {
    # Map keystore alias prefixes to a human-readable system name.
    # Add an entry for each certificate alias prefix used in your CPI landscape.
    "your_system_alias": "Your Integration System",
    "another_system":    "Another Integration System",
    "sftp":              "SFTP connections",
}


def load_config():
    if not CONFIG_FILE.exists():
        print(f"ERROR: Config file not found: {CONFIG_FILE}")
        print("Copy scripts/cert_monitor_config.example.json to scripts/cert_monitor_config.json and fill in credentials.")
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        return json.load(f)


def get_token(token_url, client_id, client_secret):
    resp = requests.post(
        token_url,
        data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_keystores(tenant_url, token):
    url = f"{tenant_url}/api/v1/KeystoreEntries"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("d", {}).get("results", [])


def epoch_to_date(epoch_str):
    ms = int(epoch_str.replace("/Date(", "").replace(")/", ""))
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def classify(days_left):
    if days_left < 0:
        return "EXPIRED", "🔴"
    elif days_left <= THRESHOLDS["critical"]:
        return "CRITICAL", "🔴"
    elif days_left <= THRESHOLDS["warning"]:
        return "WARNING", "🟡"
    return "OK", "✅"


def infer_usage(alias):
    alias_lower = alias.lower()
    for pattern, usage in ALIAS_USAGE.items():
        if pattern in alias_lower:
            return usage
    return "Unknown"


def check_tenant(name, tenant_url, token_url, client_id, client_secret):
    try:
        token = get_token(token_url, client_id, client_secret)
        entries = get_keystores(tenant_url, token)
        now = datetime.now(tz=timezone.utc)
        results = []
        for e in entries:
            expiry = epoch_to_date(e["ValidNotAfter"])
            days_left = (expiry - now).days
            status, icon = classify(days_left)
            if status == "OK":
                continue
            results.append({
                "tenant": name,
                "alias": e["Alias"],
                "keyType": e["KeyType"],
                "expiry": expiry.strftime("%Y-%m-%d"),
                "days_left": days_left,
                "status": status,
                "icon": icon,
                "usage": infer_usage(e["Alias"]),
            })
        return sorted(results, key=lambda x: x["days_left"])
    except Exception as ex:
        print(f"WARNING: Could not check tenant {name}: {ex}")
        return []


def send_email(findings, run_date, recipients):
    import win32com.client as win32
    outlook = win32.Dispatch("Outlook.Application")
    mail = outlook.CreateItem(0)
    mail.To = "; ".join(recipients)
    mail.Subject = f"CPI Certificate Expiry Alert — {run_date}"

    if not findings:
        mail.HTMLBody = f"""
        <h2>🔒 CPI Weekly Cert Check — {run_date}</h2>
        <p style="color:green">✅ All certificates are healthy. Nothing expiring within 90 days.</p>
        """
        mail.Send()
        print("Email sent — all healthy.")
        return

    expired  = [f for f in findings if f["status"] == "EXPIRED"]
    critical = [f for f in findings if f["status"] == "CRITICAL"]
    warning  = [f for f in findings if f["status"] == "WARNING"]

    rows = ""
    for f in findings:
        if f["status"] == "EXPIRED":
            bg = "#ffe0e0"
        elif f["status"] == "CRITICAL":
            bg = "#fff0e0"
        else:
            bg = "#fffde0"
        rows += f"""
        <tr style="background:{bg}">
            <td>{f['icon']} {f['status']}</td>
            <td><b>{f['alias']}</b></td>
            <td>{f['tenant']}</td>
            <td>{f['expiry']}</td>
            <td>{f['days_left']}d</td>
            <td>{f['usage']}</td>
        </tr>"""

    mail.HTMLBody = f"""
    <h2>🔒 CPI Weekly Certificate Expiry Check — {run_date}</h2>
    <p>
        🔴 <b>{len(expired)} EXPIRED</b> &nbsp;|&nbsp;
        🔴 <b>{len(critical)} CRITICAL (≤30 days)</b> &nbsp;|&nbsp;
        🟡 <b>{len(warning)} WARNING (≤90 days)</b>
    </p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
        <thead style="background:#f0f0f0">
            <tr>
                <th>Status</th>
                <th>Alias</th>
                <th>Tenant</th>
                <th>Expiry Date</th>
                <th>Days Left</th>
                <th>Likely Used In</th>
            </tr>
        </thead>
        <tbody>{rows}</tbody>
    </table>
    <br>
    <p style="color:#666;font-size:12px">
        Renew via: <b>SAP CPI Monitor → Security Material → Keystore</b><br>
        This alert is generated automatically every Monday by the CPI Maestro cert monitor.
    </p>
    """
    mail.Send()
    print(f"Email sent to {', '.join(recipients)}")


def main():
    config = load_config()
    run_date = datetime.now().strftime("%Y-%m-%d")
    all_findings = []

    for tenant in config["tenants"]:
        print(f"Checking {tenant['name']}...")
        findings = check_tenant(
            tenant["name"],
            tenant["tenant_url"],
            tenant["token_url"],
            tenant["client_id"],
            tenant["client_secret"],
        )
        all_findings.extend(findings)
        print(f"  -> {len(findings)} expiring/expired certs found")

    send_email(all_findings, run_date, config["email_recipients"])
    print("Done.")


if __name__ == "__main__":
    main()
