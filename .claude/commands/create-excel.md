---
description: >
  Shared Excel report skill. Agent owns data fetching and format definition.
  This skill owns file creation and path reporting.
  Usage:
    /create-excel mirror     <iflow-id> [src=DEV] [tgt=TEST] [out=<folder>]
    /create-excel cert       [out=<folder>]
    /create-excel governance --data <jira_json_path> [out=<folder>]
  Examples:
    /create-excel mirror UpdateOpportunity
    /create-excel cert
    /create-excel governance --data C:\...\governance_report\_jira_data.json
---

Generate an Excel report for: **$ARGUMENTS**

---

## Architecture (3-step separation)

```
Step 1 — Agent (you): fetch data + write to temp JSON    ← agent-owned
Step 2 — Engine:      python scripts/excel_export.py     ← shared
Step 3 — Engine:      prints file path → you report it   ← shared
```

---

## Step 1 — Parse arguments

- First token = mode (`mirror` or `cert`)
- `mirror`: second token = iFlow artifact ID, `src=` (default DEV), `tgt=` (default TEST)
- `cert`: no additional arguments

---

## Step 2 — Fetch data and write to temp JSON

**For mirror mode** — fetch iFlow snapshots from both tenants:

```python
import urllib.request, urllib.parse, json, os, tempfile
from pathlib import Path

def load_env(label):
    cfg = {}
    with open(Path('mcp') / f'.env.{label.lower()}') as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k,_,v = line.partition('=')
                cfg[k.strip()] = v.strip()
    return cfg

def get_token(cfg):
    data = urllib.parse.urlencode({'grant_type':'client_credentials',
        'client_id':cfg['CPI_CLIENT_ID'],'client_secret':cfg['CPI_CLIENT_SECRET']}).encode()
    req = urllib.request.Request(cfg['CPI_TOKEN_URL'], data=data,
        headers={'Content-Type':'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())['access_token']

def get_snap(cfg, iflow_id):
    token = get_token(cfg)
    try:
        with urllib.request.urlopen(urllib.request.Request(
            f"{cfg['CPI_TENANT_URL']}/api/v1/IntegrationRuntimeArtifacts('{iflow_id}')",
            headers={'Authorization':f'Bearer {token}','Accept':'application/json'}), timeout=30) as r:
            art = json.loads(r.read().decode()).get('d',{})
    except: art = {}
    try:
        with urllib.request.urlopen(urllib.request.Request(
            f"{cfg['CPI_TENANT_URL']}/api/v1/IntegrationDesigntimeArtifacts(Id='{iflow_id}',Version='active')/Configurations",
            headers={'Authorization':f'Bearer {token}','Accept':'application/json'}), timeout=30) as r:
            params = {i.get('ParameterKey'):i.get('ParameterValue') for i in
                      json.loads(r.read().decode()).get('d',{}).get('results',[])}
    except: params = {}
    if not art: return None
    return {'name':art.get('Name',iflow_id),'status':art.get('Status','UNKNOWN'),
            'version':art.get('Version','—'),'deployedOn':str(art.get('DeployedOn',''))[:10],
            'deployedBy':art.get('DeployedBy','—'),'packageId':art.get('PackageId','—'),
            'logLevel':art.get('LogLevel','INFO'),'params':params}

IFLOW = '{iflow_id}'
src_cfg = load_env('{src}')
tgt_cfg = load_env('{tgt}')
src_snap = get_snap(src_cfg, IFLOW)
tgt_snap = get_snap(tgt_cfg, IFLOW)

iflow_name = (src_snap or tgt_snap or {}).get('name', IFLOW)
data = {'src':'{src}','tgt':'{tgt}','iflow_id':IFLOW,'iflow_name':iflow_name,
        'src_snap':src_snap,'tgt_snap':tgt_snap,'src_errors':0,'tgt_errors':0}

tmp = tempfile.mktemp(suffix='.json')
json.dump(data, open(tmp,'w'))
print(tmp)
```

**For cert mode** — fetch keystores from all configured tenants:

```python
import urllib.request, urllib.parse, json, os, tempfile
from datetime import datetime, timezone
from pathlib import Path

ALIAS_USAGE = {
    'outreach':'Outreach integration','ci_c4cv2':'C4C v2 / SCV2','c4cv2':'C4C v2 / SCV2',
    'ci_aem':'AEM integration','cpq':'CPQ 2.0','snc.':'SNC / Secure Network Comms',
    'concur':'Concur','gts':'GTS','eic':'EIC integration','ems':'EMS',
    'sftp':'SFTP connections','delos':'SFTP connections','i5d':'I5D/I5T system',
    'i5t':'I5D/I5T system','sap_':'SAP root CA (SAP-managed)',
    'ws_isf':'ISF / Web Services','ci_c4c':'C4C integration',
}

def infer(alias):
    a = alias.lower()
    for pat, usage in ALIAS_USAGE.items():
        if pat in a: return usage
    return 'Unknown'

def classify(days):
    if days < 0: return 'EXPIRED'
    if days <= 30: return 'CRITICAL'
    if days <= 90: return 'WARNING'
    return 'OK'

# [load_env and get_token functions same as above]

now_ms = datetime.now(timezone.utc).timestamp() * 1000
findings, checked, skipped = [], [], []

for label in ['DEV','TEST','PROD']:
    env_file = Path('mcp') / f'.env.{label.lower()}'
    if not env_file.exists(): skipped.append(label); continue
    # [fetch keystores, classify, append to findings]
    # same as current cert_expiry_monitor.py logic

ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
data = {'findings':findings,'checked':checked,'skipped':skipped,'ts':ts}
tmp = tempfile.mktemp(suffix='.json')
json.dump(data, open(tmp,'w'))
print(tmp)
```

---

## Step 3 — Run the engine

```bash
python scripts/excel_export.py --mode {mode} --data {tmp_json_path}
```

Engine reads JSON → builds Workbook → saves → prints path.

---

## Step 4 — Report path and clean up

```bash
# Delete temp JSON
os.remove(tmp_json_path)
```

Report to user:
```
Excel report: {path}
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `mcp/.env.{env} not found` | Copy `mcp/.env.example` → fill BTP credentials |
| `openpyxl not installed` | `pip install -r scripts/requirements.txt` |
| iFlow not found | Use exact artifact ID |
