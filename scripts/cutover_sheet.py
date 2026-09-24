import sys, os, json, re, urllib.request, argparse
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')

# ── Argument parsing ──────────────────────────────────────────────────────────
def _parse_args():
    ap = argparse.ArgumentParser(description='CPI Integration Cutover Sheet Generator')
    ap.add_argument('--release', required=True,
                    help='Release code e.g. RD08.26, RD10.26, RD11.26')
    ap.add_argument('--version', default=None,
                    help='Output file version suffix e.g. v1 (default: auto-increment from Downloads)')
    return ap.parse_args()

ARGS = _parse_args()

# Normalise: accept RD08, RD08.26, RD08.2026 → canonical 2-digit year form (RD08.26)
_rel = ARGS.release.upper().strip()
_m = re.match(r'RD(\d+)\.?(\d+)?', _rel)
if not _m:
    print(f'ERROR: invalid release format "{ARGS.release}". Use e.g. RD08.26', flush=True)
    sys.exit(1)
_mm  = _m.group(1).zfill(2)   # e.g. "08"
_yy  = (_m.group(2) or '26')  # e.g. "26"
if len(_yy) == 4: _yy = _yy[2:]  # RD08.2026 → 26

RELEASE_FV   = f'RD{_mm}.{_yy}'          # e.g. RD08.26  — used in JIRA fixVersion filter
RELEASE_NAME = RELEASE_FV.upper()         # e.g. RD08.26  — used in sheet tabs + titles
SHEET_NAME   = f'{RELEASE_NAME} Sheet'

# ── Release metadata lookup ───────────────────────────────────────────────────
_RELEASE_META = {}  # Populate with your release schedule: {'RD##': {'pdd': 'DD.MM.YYYY', 'go_live': 'DD.MM.YYYY', 'pi': 'PI##/##'}, ...}
_meta_key = f'RD{_mm}'
_meta = _RELEASE_META.get(_meta_key, {'pdd': 'TBD', 'go_live': 'TBD', 'pi': 'TBD'})
RELEASE_PDD     = _meta['pdd']
RELEASE_GOLIVE  = _meta['go_live']
RELEASE_PI      = _meta['pi']

# ── Auto-detect next version number from Downloads ────────────────────────────
def _next_version():
    if ARGS.version: return ARGS.version
    dl = os.path.expanduser('~/Downloads')
    import glob
    existing = glob.glob(os.path.join(dl, f'{RELEASE_NAME} Cutover v*.xlsx'))
    nums = []
    for f in existing:
        m = re.search(r'v(\d+)\.xlsx$', os.path.basename(f))
        if m: nums.append(int(m.group(1)))
    return f'v{max(nums)+1}' if nums else 'v1'


try:
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    import subprocess; subprocess.run([sys.executable,'-m','pip','install','openpyxl','-q'])
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

# ── Auth ──────────────────────────────────────────────────────────────────────
TOKEN = json.load(open(os.path.expanduser('~/.claude/jira_oauth_token.json')))['access_token']
MCP_JIRA = os.environ.get('JIRA_MCP_URL', 'https://mcp.jira.<YOUR-DOMAIN>/mcp')

def jira_mcp(tool, args):
    global TOKEN
    for attempt in range(2):
        try:
            p = json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':tool,'arguments':args}}).encode('utf-8')
            req = urllib.request.Request(MCP_JIRA, data=p,
                headers={'Content-Type':'application/json','Authorization':f'Bearer {TOKEN}','Accept':'application/json, text/event-stream'})
            with urllib.request.urlopen(req, timeout=45) as r:
                raw = r.read().decode('utf-8')
            for line in raw.split('\n'):
                if line.startswith('data:'):
                    return json.loads(line[5:].strip())
            return {}
        except urllib.error.HTTPError as e:
            if e.code == 401 and attempt == 0:
                import subprocess
                subprocess.run([sys.executable,'scripts/jira_auth_helper.py','--silent'],capture_output=True)
                TOKEN = json.load(open(os.path.expanduser('~/.claude/jira_oauth_token.json')))['access_token']
            else:
                return {}
    return {}

def refresh_token():
    global TOKEN
    import subprocess
    subprocess.run([sys.executable,'scripts/jira_auth_helper.py','--silent'],capture_output=True)
    TOKEN = json.load(open(os.path.expanduser('~/.claude/jira_oauth_token.json')))['access_token']

def get_issue(key):
    for attempt in range(2):
        try:
            r = jira_mcp('jira_get_issue', {'issue_key': key})
            c = r.get('result',{}).get('content',[])
            if not c: return {}
            txt = c[0].get('text','')
            if not txt: return {}
            return json.loads(txt)
        except Exception as e:
            if attempt == 0:
                refresh_token()
            else:
                print(f'  WARN get_issue({key}): {e}', flush=True)
                return {}
    return {}

def search_all(jql, tag=''):
    all_issues, start = [], 0
    while True:
        r = jira_mcp('jira_search', {'jql': jql, 'limit': 50, 'start_at': start})
        c = r.get('result',{}).get('content',[])
        if not c: break
        parsed = json.loads(c[0]['text'])
        issues = parsed.get('issues', [])
        total  = parsed.get('total', 0)
        all_issues.extend(issues)
        start += len(issues)
        if not issues or start >= total: break
    if tag: print(f'  {tag}: {len(all_issues)}', flush=True)
    return all_issues

# ── CPI DEV runtime cache (1 call total) ─────────────────────────────────────
# Load pre-fetched runtime artifact list
RUNTIME_FILE = os.path.join(os.path.dirname(__file__), 'runtime_cache.json')

def load_cpi_runtime():
    """Load from cached file written by earlier get_runtime_artifacts call."""
    if os.path.exists(RUNTIME_FILE):
        return json.load(open(RUNTIME_FILE, encoding='utf-8'))
    return []

CPI_RUNTIME = load_cpi_runtime()
print(f'  CPI DEV artifacts loaded: {len(CPI_RUNTIME)}', flush=True)

# ── Module-level constants (defined once, reused everywhere) ──────────────────
def _load_team_config():
    cfg = os.path.join(os.path.dirname(__file__), '..', 'config', 'team.json')
    try:
        with open(cfg, encoding='utf-8') as f:
            return json.load(f).get('team', [])
    except FileNotFoundError:
        return []

_TEAM = _load_team_config()
CPI_UID_MAP = {m['cid']: m['name'] for m in _TEAM}
AEM_SIGNALS = ['jms://', 'amqp', 'destinationname', 'jmsqueue', 'jms_queue', 'advancedeventmesh']
_STOP_WORDS = {'from','to','sap','the','and','for','in','of','v2','v1'}

# O(1) runtime lookup indices built once at load
_CPI_BY_ID   = {a['id']: a for a in CPI_RUNTIME}
_CPI_BY_NAME = {a['name'].lower(): a for a in CPI_RUNTIME}

def match_iflow(name):
    """Fuzzy match iFlow name → CPI DEV artifact. O(1) exact, O(n) fuzzy fallback."""
    if not name or name == 'TBD': return None
    n = name.strip().lower()
    if n in _CPI_BY_NAME: return _CPI_BY_NAME[n]
    # Contains match
    for k, v in _CPI_BY_NAME.items():
        if n in k or k in n: return v
    # Word overlap (>60%)
    words = set(re.findall(r'\w+', n)) - _STOP_WORDS
    best, best_score = None, 0
    for k, v in _CPI_BY_NAME.items():
        kw = set(re.findall(r'\w+', k)) - _STOP_WORDS
        score = len(words & kw) / len(words) if words else 0
        if score > best_score and score > 0.6:
            best, best_score = v, score
    return best

def is_standard_flow(artifact_id): return _is_standard(artifact_id)  # kept for compat

# iFlow content cache
IFLOW_CONTENT_CACHE = {}

# Load full iFlow content cache fetched from CPI DEV session
_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rd08_iflow_content_cache.json')
_IFLOW_CONTENT_DB = {}
if os.path.exists(_CACHE_FILE):
    with open(_CACHE_FILE, encoding='utf-8') as _f:
        _IFLOW_CONTENT_DB = json.load(_f)
    print(f'  iFlow content cache loaded: {len(_IFLOW_CONTENT_DB)} entries', flush=True)

def get_iflow_content_cached(artifact_id):
    if not artifact_id or artifact_id == 'TBD': return {}
    if artifact_id in IFLOW_CONTENT_CACHE: return IFLOW_CONTENT_CACHE[artifact_id]
    result = _IFLOW_CONTENT_DB.get(artifact_id, {})
    IFLOW_CONTENT_CACHE[artifact_id] = result
    return result

# ── Shared CPI helpers (defined once, used in all cpi_derive* variants) ───────
def _is_standard(artifact_id):
    return 'Standard' if (artifact_id or '').startswith('com.sap.') else 'Custom'

def _deployer_name(artifact):
    return CPI_UID_MAP.get(artifact.get('deployedBy',''), artifact.get('deployedBy',''))

def _derive_methodology(steps_lower):
    if any(k in steps_lower for k in ['autoflow','event','notification','survey','get opp']):
        return 'Event-Driven'
    if any(k in steps_lower for k in ['replication','replicate','call exit','language code','exit']):
        return 'P2P'
    if 'mashup' in steps_lower:
        return 'Mashup'
    return ''

def _extract_sender_receiver(scripts_orig, iflow_name=''):
    ms = re.search(r'SAP_Sender["\s,]+["\s]*([^"\')\n]+)["\']', scripts_orig)
    mr = re.search(r'SAP_Receiver["\s,]+["\s]*([^"\')\n]+)["\']', scripts_orig)
    sender   = _normalise_system(ms.group(1).strip()) if ms else ''
    receiver = _normalise_system(mr.group(1).strip()) if mr else ''
    # Name-pattern fallback
    if not sender or not receiver:
        nl = iflow_name.lower()
        if 'from sap s4hana' in nl or 'from s4' in nl:
            sender = sender or 'SAP S/4HANA'; receiver = receiver or 'SAP Sales Cloud V2 (SCV2)'
        elif 'from c4c' in nl or 'from_c4cv2' in nl or 'from scv2' in nl or 'from sales cloud' in nl:
            sender = sender or 'SAP Sales Cloud V2 (SCV2)'
            receiver = receiver or _normalise_system(_infer_target_from_name(nl))
        elif 'in ccs' in nl or 'in_ccs' in nl or 'to ccs' in nl:
            sender = sender or 'SAP Sales Cloud V2 (SCV2)'; receiver = receiver or 'SAP CCS (Customer Communication Service)'
        elif 'to s4' in nl or 'to sap s4' in nl:
            sender = sender or 'SAP Sales Cloud V2 (SCV2)'; receiver = receiver or 'SAP S/4HANA'
    return sender, receiver

def _detect_aem(content, steps_lower, scripts_text):
    cache_aem = content.get('has_aem_adapter', False)
    return cache_aem or any(k in scripts_text for k in AEM_SIGNALS) or any(k in steps_lower for k in ['jms','amqp'])

def _manual_config(methodology, cache_aem):
    if cache_aem: return 'Y — Configure AdvancedEventMesh adapter topic/queue in CPI Designer for each tenant'
    if methodology == 'Event-Driven': return 'Y — Register CPI endpoint URL in SCV2 Autoflow for each tenant'
    return 'N'

def _config_params(methodology, cache_aem, scripts_orig, mappings):
    parts = []
    for line in scripts_orig.split('\n'):
        m = re.search(r'(?:lookupStore|SecureAlias|secureParameter)\s*\(\s*["\']([^"\']+)["\']', line)
        if m: parts.append(f'Credential alias: {m.group(1)}')
        m = re.search(r'(?:baseUrl|endpoint|url|host)\s*[=:]\s*["\']([^"\']+)["\']', line, re.I)
        if m and 'http' in m.group(1): parts.append(f'Endpoint: {m.group(1)}')
    if cache_aem:
        parts.insert(0, 'AEM Inbound: configure AdvancedEventMesh adapter — topic/queue in iFlow adapter config')
        parts.append('AEM OAuth credential alias must exist in target tenant')
    elif methodology == 'Event-Driven':
        parts.insert(0, 'HTTP Inbound: register CPI endpoint URL in SCV2 Autoflow')
        parts.append('HTTP Outbound: configure SCV2 base URL + OAuth credential alias')
    elif methodology == 'P2P':
        parts.insert(0, 'Verify source/target credential aliases exist in tenant credential store')
    if mappings: parts.append(f'Mapping files: {", ".join(mappings)}')
    return '\n'.join(dict.fromkeys(parts)) if parts else 'Unable to identify — check adapter configuration manually'

def _aem_queue_values(content, scripts_orig, has_aem):
    if not has_aem: return 'N/A', 'N/A', 'N/A'
    aem_note = content.get('aem_note', '')
    mq = re.search(r'(?:destinationName|jmsQueue|queue|topic)\s*[=:]\s*["\']([^"\']+)["\']', scripts_orig, re.I)
    val = mq.group(1) if mq else 'Check iFlow adapter config in CPI Designer'
    return val, val, val  # autoflow, topic, queue

def _infer_target_from_name(name_lower):
    """Infer target system from iFlow name keywords — returns normalised name."""
    if 'ccs' in name_lower:                          return 'SAP CCS (Customer Communication Service)'
    if 's4hana' in name_lower or 's4' in name_lower: return 'SAP S/4HANA'
    if 'cpq' in name_lower:                          return 'SAP CPQ'
    if 'brim' in name_lower or 'som' in name_lower:  return 'SAP BRIM/SOM'
    if 'mdg' in name_lower:                          return 'SAP MDG'
    if 'c4c' in name_lower or 'scv2' in name_lower or 'sales cloud' in name_lower: return 'SAP Sales Cloud V2 (SCV2)'
    return ''

def _normalise_system(name):
    """Normalise system name to consistent display form."""
    if not name: return ''
    n = name.lower().strip()
    if any(k in n for k in ['c4c','scv2','sales cloud','sap c4c','sap sales cloud']): return 'SAP Sales Cloud V2 (SCV2)'
    if 's4hana' in n or 's/4hana' in n or 's4' in n: return 'SAP S/4HANA'
    if 'ccs' in n: return 'SAP CCS (Customer Communication Service)'
    if 'cpq' in n: return 'SAP CPQ'
    if 'brim' in n or 'som' in n: return 'SAP BRIM/SOM'
    if 'mdg' in n: return 'SAP MDG'
    return name  # return as-is if no match

def cpi_derive(iflow_name, art_key):
    """Given iFlow name from Developer Section, return CPI-derived column values."""
    artifact = match_iflow(iflow_name)
    if not artifact:
        return {'iflow_id': '', 'iflow_id_display': 'Not found in DEV',
                'build_status': 'TBD', 'existing_new': 'New', 'standard_flow': 'TBD',
                'deployed_on': '', 'deployed_by': '', 'methodology_cpi': '', 'aem_confirmed': 'N',
                'has_mapping': 'N/A', 'sender_confirmed': '', 'receiver_confirmed': '',
                'manual_config': 'TBD', 'config_params': '', 'aem_autoflow': '', 'aem_topic': '', 'aem_queue': ''}

    aid          = artifact['id']
    content      = get_iflow_content_cached(aid)
    steps_lower  = ' '.join(content.get('bpmnSteps', [])).lower()
    scripts_orig = ' '.join(content.get('scripts', {}).values())
    scripts_text = scripts_orig.lower()
    mappings     = content.get('mappings', [])
    cache_aem    = content.get('has_aem_adapter', False)

    methodology = _derive_methodology(steps_lower)
    sender, receiver = _extract_sender_receiver(scripts_orig, iflow_name)
    if cache_aem: sender = 'SAP Advanced Event Mesh (AEM)'
    has_aem = _detect_aem(content, steps_lower, scripts_text)
    aem_auto, aem_topic, aem_queue = _aem_queue_values(content, scripts_orig, has_aem)

    return {
        'iflow_id': aid, 'iflow_id_display': aid,
        'build_status': artifact['status'], 'deployed_on': artifact.get('deployedOn','')[:10],
        'deployed_by': _deployer_name(artifact), 'existing_new': 'Existing',
        'standard_flow': _is_standard(aid), 'methodology_cpi': methodology,
        'aem_confirmed': 'Y' if has_aem else 'N',
        'has_mapping': ('Y — ' + ', '.join(mappings)) if mappings else 'N',
        'sender_confirmed': sender, 'receiver_confirmed': receiver,
        'manual_config': _manual_config(methodology, cache_aem),
        'config_params': _config_params(methodology, cache_aem, scripts_orig, mappings),
        'aem_autoflow': aem_auto, 'aem_topic': aem_topic, 'aem_queue': aem_queue,
    }

def _cpi_enrich_artifact(aid, iflow_name):
    """Core enrichment for a known artifact ID — used by both by_id functions."""
    runtime_art = _CPI_BY_ID.get(aid) or match_iflow(iflow_name)  # O(1) then fuzzy fallback
    if not runtime_art:
        return None, {}
    content = get_iflow_content_cached(aid)
    return runtime_art, content

def cpi_derive_by_id(artifact_id, iflow_name, art_key):
    """Derive CPI columns using exact artifact ID from table — no fuzzy matching."""
    runtime_art, content = _cpi_enrich_artifact(artifact_id, iflow_name)
    if not runtime_art:
        return cpi_derive(iflow_name, art_key)  # fallback to name-based

    steps_lower  = ' '.join(content.get('bpmnSteps', [])).lower()
    scripts_orig = ' '.join(content.get('scripts', {}).values())
    scripts_text = scripts_orig.lower()
    mappings     = content.get('mappings', [])
    cache_aem    = content.get('has_aem_adapter', False)

    methodology = _derive_methodology(steps_lower)
    sender, receiver = _extract_sender_receiver(scripts_orig, iflow_name)
    if cache_aem: sender = 'SAP Advanced Event Mesh (AEM)'
    has_aem = _detect_aem(content, steps_lower, scripts_text)
    aem_auto, aem_topic, aem_queue = _aem_queue_values(content, scripts_orig, has_aem)

    return {
        'iflow_id': artifact_id, 'iflow_id_display': artifact_id,
        'build_status': runtime_art['status'], 'deployed_on': runtime_art.get('deployedOn','')[:10],
        'deployed_by': _deployer_name(runtime_art), 'existing_new': 'Existing',
        'standard_flow': _is_standard(artifact_id), 'methodology_cpi': methodology,
        'aem_confirmed': 'Y' if has_aem else 'N',
        'has_mapping': ('Y — ' + ', '.join(mappings)) if mappings else 'N',
        'sender_confirmed': sender, 'receiver_confirmed': receiver,
        'manual_config': _manual_config(methodology, cache_aem),
        'config_params': _config_params(methodology, cache_aem, scripts_orig, mappings),
        'aem_autoflow': aem_auto, 'aem_topic': aem_topic, 'aem_queue': aem_queue,
    }

def cpi_derive_multi_by_ids(iflow_names, iflow_ids, version_str, art_key):
    """Aggregate enrichment for multi-iFlow ART using exact IDs from table."""
    all_statuses, all_steps_lower, all_scripts_orig = [], '', ''
    all_mappings, all_deployers, all_std = [], [], []
    matched_rows = []

    # CPI_UID_MAP is defined at module level from config/team.json

    versions = version_str.split('\n') if version_str else []

    for i, (name, aid) in enumerate(zip(iflow_names, iflow_ids)):
        runtime_art = _CPI_BY_ID.get(aid) or match_iflow(name)  # O(1) first
        if not runtime_art: runtime_art = match_iflow(name)
        if not runtime_art: continue
        content = get_iflow_content_cached(aid)
        steps = content.get('bpmnSteps', [])
        scripts_orig = ' '.join(content.get('scripts', {}).values())
        mappings = content.get('mappings', [])
        ver = versions[i] if i < len(versions) else ''
        std = 'Standard' if aid.startswith('com.sap.') else 'Custom'
        all_statuses.append(runtime_art['status'])
        all_steps_lower += ' ' + ' '.join(steps).lower()
        all_scripts_orig += ' ' + scripts_orig
        all_mappings.extend(mappings)
        all_deployers.append((runtime_art.get('deployedBy',''), std))
        all_std.append(std)
        matched_rows.append({'idx': i+1, 'name': name, 'id': aid, 'std': std, 'ver': ver,
                              'status': runtime_art['status']})

    if not matched_rows:
        return cpi_derive_multi(iflow_names, art_key)

    build_st = 'STARTED' if all(s=='STARTED' for s in all_statuses) else (
               'ERROR' if any(s=='ERROR' for s in all_statuses) else all_statuses[0])

    if any(k in all_steps_lower for k in ['replication','replicate','call exit','language code']):
        methodology = 'P2P'
    elif any(k in all_steps_lower for k in ['event','autoflow','get opp','survey']):
        methodology = 'Event-Driven'
    else:
        methodology = 'P2P'

    name_concat = ' '.join(iflow_names).lower()
    sender, receiver = _extract_sender_receiver(all_scripts_orig, name_concat)

    unique_maps = list(dict.fromkeys(all_mappings))
    unique_std  = list(dict.fromkeys(all_std))
    std_display = unique_std[0] if len(unique_std)==1 else 'Standard + Custom'
    deployer_id = next((d for d,t in all_deployers if t=='Custom'), all_deployers[0][0] if all_deployers else '')

    id_display   = '\n'.join(f'[{r["idx"]}] {r["id"]}'  for r in matched_rows)
    name_display = '\n'.join(f'[{r["idx"]}] {r["name"]}' for r in matched_rows)
    std_per_row  = '\n'.join(f'[{r["idx"]}] {r["std"]}'  for r in matched_rows)
    ver_per_row  = '\n'.join(f'[{r["idx"]}] {r["ver"]}'  for r in matched_rows if r['ver'])

    return {
        'iflow_id': matched_rows[0]['id'], 'iflow_id_display': id_display,
        'iflow_name_display': name_display, 'std_flow_display': std_per_row,
        'version_display': ver_per_row,
        'build_status': build_st, 'existing_new': 'Existing',
        'standard_flow': std_display, 'deployed_on': '',
        'deployed_by': _deployer_name({'deployedBy': deployer_id}),
        'methodology_cpi': methodology, 'aem_confirmed': 'N',
        'has_mapping': ('Y — ' + ', '.join(unique_maps)) if unique_maps else 'N',
        'sender_confirmed': sender, 'receiver_confirmed': receiver,
        'manual_config': _manual_config(methodology, False),
        'config_params': _config_params(methodology, False, '', unique_maps),
        'aem_autoflow': 'N/A', 'aem_topic': 'N/A', 'aem_queue': 'N/A',
    }

def cpi_derive_multi(iflow_names, art_key):
    """Aggregate CPI enrichment across multiple iFlows in one ART.
    Rules:
    - iFlow IDs: all matched IDs joined (shows the full set)
    - Build status: STARTED only if ALL matched iFlows are STARTED; else worst status
    - Methodology: derived from bpmnSteps across all iFlows (majority wins)
    - Source/Target: inferred from iFlow name patterns (most reliable for standard SAP flows)
    - Mapping: Y if any iFlow has a mapping file
    - Standard/Custom: 'Standard+Custom' if mix; else 'Standard' or 'Custom'
    - Config params: union across all
    - Deployer: from the first custom iFlow (most recently deployed one with ownership)
    """
    all_ids, all_statuses, all_steps_lower = [], [], ''
    all_scripts_orig, all_mappings, all_deployers = '', [], []
    all_std = []

    for name in iflow_names:
        art = match_iflow(name)
        if not art:
            continue
        aid = art['id']
        content = get_iflow_content_cached(aid)
        steps = content.get('bpmnSteps', [])
        scripts_orig = ' '.join(content.get('scripts', {}).values())
        mappings = content.get('mappings', [])

        all_ids.append(aid)
        all_statuses.append(art['status'])
        all_steps_lower += ' ' + ' '.join(steps).lower()
        all_scripts_orig += ' ' + scripts_orig
        all_mappings.extend(mappings)
        all_deployers.append((art.get('deployedBy',''), 'Custom' if not aid.startswith('com.sap.') else 'Standard'))
        all_std.append('Standard' if aid.startswith('com.sap.') else 'Custom')

    if not all_ids:
        return {k:'' for k in ['iflow_id','iflow_id_display','build_status','existing_new',
            'standard_flow','deployed_on','deployed_by','methodology_cpi','aem_confirmed',
            'has_mapping','sender_confirmed','receiver_confirmed','manual_config',
            'config_params','aem_autoflow','aem_topic','aem_queue']}

    # Build status: STARTED only if all started; else show worst
    if all(s == 'STARTED' for s in all_statuses):
        build_st = 'STARTED'
    elif any(s == 'ERROR' for s in all_statuses):
        build_st = 'ERROR'
    elif any(s == 'STOPPED' for s in all_statuses):
        build_st = 'STOPPED'
    else:
        build_st = all_statuses[0]

    # Methodology from aggregated steps
    if any(k in all_steps_lower for k in ['replication','replicate','call exit','language code']):
        methodology = 'P2P'
    elif any(k in all_steps_lower for k in ['event','autoflow','get opp','survey','notification']):
        methodology = 'Event-Driven'
    else:
        methodology = 'P2P'

    # Source/Target via shared helper (uses name pattern + Groovy header fallback)
    sender, receiver = _extract_sender_receiver(all_scripts_orig, ' '.join(iflow_names))

    # Standard/Custom, mappings, deployer
    unique_std  = list(dict.fromkeys(all_std))
    std_flow    = unique_std[0] if len(unique_std) == 1 else 'Standard + Custom'
    unique_maps = list(dict.fromkeys(all_mappings))
    deployer_id = next((d for d,t in all_deployers if t == 'Custom'), all_deployers[0][0] if all_deployers else '')

    id_display = '\n'.join(all_ids) if len(all_ids) <= 2 else f'{all_ids[0]}\n+ {len(all_ids)-1} more'

    return {
        'iflow_id': all_ids[0], 'iflow_id_display': id_display,
        'build_status': build_st, 'existing_new': 'Existing',
        'standard_flow': std_flow, 'deployed_on': '',
        'deployed_by': _deployer_name({'deployedBy': deployer_id}),
        'methodology_cpi': methodology,
        'aem_confirmed': 'Y' if any(k in all_steps_lower for k in AEM_SIGNALS) else 'N',
        'has_mapping': ('Y — ' + ', '.join(unique_maps)) if unique_maps else 'N',
        'sender_confirmed': sender, 'receiver_confirmed': receiver,
        'manual_config': _manual_config(methodology, False),
        'config_params': _config_params(methodology, False, '', unique_maps),
        'aem_autoflow': '', 'aem_topic': '', 'aem_queue': '',
    }

# ── ART description parsers ───────────────────────────────────────────────────
def find_sec(desc, *markers):
    # Strip JIRA markdown escapes (\* \_ etc.) before searching so
    # "**CPI Developer Section:**" stored as "\*\*CPI Developer Section:\*\*" is found
    plain = desc.replace('\\*','').replace('\\_','').replace('\\[','[').replace('\\]',']')
    for m in markers:
        i = plain.find(m)
        if i >= 0:
            # Return from original desc at same approximate position (offsets may differ by stripped chars)
            # Use regex on original to find robustly
            pat = re.escape(m).replace(r'\ ', r'[\s\*\\]*')
            rm = re.search(pat, desc, re.I)
            if rm:
                return desc[rm.start():rm.start()+2000]
            return plain[i:i+2000]
    return ''

def tval(chunk, field):
    # Strip markdown escapes from chunk before parsing field values
    plain = chunk.replace('\\*','').replace('\\_','').replace('\\[','[').replace('\\]',']')
    m = re.search(rf'\|{re.escape(field)}\|([^|\n]+)', plain, re.I)
    if m: return m.group(1).strip()
    m = re.search(rf'{re.escape(field)}[:\s\*]+([^\n|]+)', plain, re.I)
    if m: return m.group(1).strip()
    return ''

def parse_dev(desc):
    # Must match exact header "CPI Developer Section"
    chunk = find_sec(desc, 'CPI Developer Section', 'Developer Section', 'Developer section')
    if not chunk: return {}
    # Strip JIRA markdown escapes from chunk for regex parsing
    chunk = chunk.replace('\\*','').replace('\\_','').replace('\\[','[').replace('\\]',']')
    d = {}
    for fld, key in [('IDT No','idt_no'),('Package Name','pkg'),
                     ('Documentation Completion','doc'),('Consulting Status','consult_status')]:
        v = tval(chunk, fld)
        if v and key not in d: d[key] = v

    # ── iFlow table format: |Iflow Name|Iflow ID|Version| ────────────────────
    # JIRA sometimes encodes _ as * in iFlow IDs — restore them
    def fix_id(s):
        # "Replicate*Sales*Org*Post_Exit" → "Replicate_Sales_Org_Post_Exit"
        # Rule: * between word chars = underscore; trailing _ stays
        return re.sub(r'(?<=\w)\*(?=\w)', '_', s.strip().strip('\xa0'))

    table_rows = re.findall(r'\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|', chunk)
    # Filter out header row (contains "Iflow" or "Name" as header text)
    iflow_table = [(fix_id(r[0]), fix_id(r[1]), r[2].strip())
                   for r in table_rows
                   if not re.match(r'(?i)iflow\s*name|name|flow', r[0].strip())]

    if iflow_table:
        d['iflow_names']    = [r[0] for r in iflow_table if len(r[0]) > 3]
        d['iflow_ids']      = [r[1] for r in iflow_table if len(r[1]) > 3]
        d['version']        = '\n'.join(r[2] for r in iflow_table if r[2])
    else:
        # Fallback: plain text list (no table)
        # Strategy 1: all numbered items "N.Name" anywhere in the Dev Section chunk
        # (handles YOUR_JIRA_PROJECT-1694 pattern where iFlow 2 appears after a second IDT block)
        numbered = re.findall(r'(?m)^\s*\d+\.\s*(.+?)(?:\s*[-–]\s*|$)', chunk)
        numbered_names = [n.strip() for n in numbered if len(n.strip()) > 5
                          and not re.match(r'(?i)^(iflow|idt|package|version|consulting|documentation|scenario|transport|source|target)', n.strip())]

        if numbered_names:
            d['iflow_names'] = numbered_names
        else:
            # Strategy 2: names listed under Iflow Name header (original logic, relaxed stop)
            m = re.search(r'I[Ff]low Name[:\s\*#]+(.+?)(?=\n\nVersion|\nVersion\s*:|\nConsulting|\nDocumentation|\Z)', chunk, re.S)
            if m:
                raw = m.group(1).strip()
                names = [re.sub(r'^\s*[#\*\s]+','',l).strip().strip('*') for l in raw.split('\n') if l.strip()]
                d['iflow_names'] = [n for n in names if n and len(n) > 3
                                    and not re.match(r'(?i)^(idt|package|version)', n)]

        # Version fallback — collect all "version" values across the whole chunk
        ver_all = re.findall(r'(?i)version\s*[-:.]\s*(\d+\.\d+(?:\.\d+)?)', chunk)
        if ver_all:
            d['version'] = '\n'.join(ver_all)

        # Version fallback (original block format)
        m = re.search(r'Version[:\s\*]+(.+?)(?=\nConsulting|\nDocumentation|\nScenario|\nIDT|\Z)', chunk, re.S)
        if m:
            raw_ver = m.group(1).strip()
            ver_list = []
            for line in raw_ver.split('\n'):
                line = re.sub(r'^\s*[#\*\s]+','',line).strip().strip('*').strip()
                if not line: continue
                sv = re.search(r'(\d+\.\d+(?:\.\d+)?)\s*$', line)
                if sv: ver_list.append(sv.group(1))
                elif re.match(r'^\d+\.\d+', line): ver_list.append(line)
            d['version'] = '\n'.join(ver_list) if ver_list else raw_ver[:40]

    m = re.search(r'Consulting Date.*?Dev.*?[:\s]+([^\n]+)', chunk, re.I)
    if m: d['consult_dev'] = m.group(1).strip()
    m = re.search(r'Consulting Date.*?Test.*?[:\s]+([^\n]+)', chunk, re.I)
    if m: d['consult_test'] = m.group(1).strip()
    m = re.search(r'Scenario Document Link[:\s]+(https?://[^\s\n]+)', chunk, re.I)
    if m: d['scenario_doc'] = m.group(1).strip()
    return d

def parse_s03(desc):
    c = find_sec(desc, '### 03','03 — Integration','03—')
    return {'pattern': tval(c,'Pattern'), 'iflow_type': tval(c,'iFlow Type') or tval(c,'Type'), 'new_enh': tval(c,'New Interface or Enhancement') or 'New'}

def parse_s04(desc):
    c = find_sec(desc, '### 04','04 — Direction','04—')
    return {'source': tval(c,'Source System'), 'target': tval(c,'Target System')}

def parse_s07(desc):
    c = find_sec(desc, '### 07','07 — Contact','Contact List')
    return {'func_lead': tval(c,'Functional Lead'), 'src_sme': tval(c,'Source System SME'), 'tgt_sme': tval(c,'Target System SME')}

def parse_s10(desc):
    c = find_sec(desc, '### 10','10 — Auth','Authentication')
    return {'auth': tval(c,'Auth Type'), 'pv_src': tval(c,'Passvault Link'), 'pv_tgt': ''}

def parse_s13(desc):
    c = find_sec(desc, '### 13D','13D —','Dependencies')
    return {'depends': tval(c,'Depends On'), 'blocks': tval(c,'Blocks'), 'assumptions': tval(c,'Assumptions')}

def cet_to_ist(cet_str):
    if not cet_str or cet_str == 'TBD': return 'TBD'
    try:
        for fmt in ['%b. %d, %Y','%B %d, %Y','%d %b %Y','%Y-%m-%d']:
            try:
                dt = datetime.strptime(cet_str.strip(), fmt)
                return (dt + timedelta(hours=4, minutes=30)).strftime('%b %d, %Y (IST)')
            except: pass
    except: pass
    return cet_str + ' +4:30h'

def ist_to_cst(ist_str):
    if not ist_str or ist_str == 'TBD': return 'TBD'
    return ist_str + ' -11:30h'

# ── JIRA helpers ──────────────────────────────────────────────────────────────
CPI_UIDS  = set(CPI_UID_MAP.keys())
CPI_NAMES = list(CPI_UID_MAP.values())

def aname(i): a=i.get('assignee') or {}; return a.get('display_name','Unassigned') if isinstance(a,dict) else 'Unassigned'
def auid(i):  a=i.get('assignee') or {}; return a.get('name','') if isinstance(a,dict) else ''
def owned(i): return auid(i) in CPI_UIDS or any(n.lower() in aname(i).lower() for n in CPI_NAMES)
def st(i):    s=i.get('status') or {}; return s.get('name','') if isinstance(s,dict) else ''
def lbls(i):  return i.get('labels') or []
def clean(s): return (s or '').replace('​','').replace(' ',' ').strip()

def tglrd(i):
    for l in lbls(i):
        if re.match(r'TGLRD\d+\.\d+',l,re.I): return l
    return ''
def bglrd(i):
    for l in lbls(i):
        if re.match(r'BGLRD\d+\.\d+',l,re.I): return l
    return ''
def rd_rel(i):
    ls=lbls(i)
    if any('TGLRD08' in l or l=='RD08' for l in ls): return 'RD08'
    if any('TGLRD07' in l or l=='RD07' for l in ls): return 'RD07'
    return next((l.upper() for l in ls if re.match(r'RD\d+$',l,re.I)),'-')
def exp_rel(i):
    # Use TGLRD label → "RD08.26" format matching JIRA "Version / Delivery" field
    t=tglrd(i)
    if t:
        m=re.match(r'TGLRD(\d+)\.(\d+)',t,re.I)
        if m: return f'RD{m.group(1)}.{m.group(2)}'
    # Fallback: RD label or RELEASE_FV if available
    try:
        return RELEASE_FV
    except NameError:
        return next((l.upper() for l in lbls(i) if re.match(r'RD\d+',l,re.I)),'TBD')
def ws(i):
    ls=lbls(i)
    if 'BRIM' in ls or 'O2C' in ls: return 'O2C'
    if 'CPQ2.0' in ls: return 'DE&R/CPQ'
    if 'OPPT' in ls or 'DealExecution&Renewal' in ls: return 'DE&R'
    if 'DemandGeneration' in ls: return 'DemandGen'
    if 'LDM' in ls: return 'LDM'
    if 'ManagePartners' in ls: return 'ManagePartners'
    if 'MDM' in ls or 'MasterData' in ls or 'Master-Data' in ls: return 'MasterData'
    return '-'
def prio(i): p=i.get('priority') or {}; return p.get('name','') if isinstance(p,dict) else ''
def pi_scope(i):
    t=tglrd(i)
    if re.match(r'TGLRD08|TGLRD10|TGLRD11',t,re.I): return 'PI26/3'
    if re.match(r'TGLRD04|TGLRD05',t,re.I): return 'PI26/2'
    return 'PI26/3' if rd_rel(i) in ('RD08','RD10','RD11') else '-'
def ovr_status(jira_st, build_st):
    j=jira_st.lower(); b=(build_st or '').lower()
    if 'blocked' in j: return 'At Risk'
    if 'cancelled' in j: return 'Cancelled'
    if ('done' in j or 'closed' in j or 'deploy' in j or 'completed' in j) and b in ('started',''): return 'On Track'
    if b == 'error': return 'At Risk'
    if b == 'started': return 'In Progress'
    return 'TBD'
def is_perf(i,desc): return 'Y' if any(l.lower() in ('max_attention','maxattention') for l in lbls(i)) or 'performance' in (i.get('summary','')+desc).lower() else 'N'

# ── 79 COLUMNS (added CPI ART Complete? after iFlow ID) ──────────────────────
COLS = [
    'Stream ART\n(Workstream)','CPI ART\n(INT-CPI)','JIRA Story/\nBug/Task',
    'Workstream\nSub Topic','RD07 or RD08\nRelevant','Expected\nRelease',
    'Movement\nNeeded?','Movement Till\nTest or Prod?','TGL/BGL','Scenario','Responsible','iFlow Name',
    'iFlow ID','CPI ART\nComplete?','Standard\nFlow','CPI Owner',
    'Workstream','Test Cutover\nRelevant','Prod Cutover\nRelevant','Stream PoC',
    'Performance\nRelevant','Integration\nMethodology','Workstream',
    'Source System','Target System','Source POC','Target POC',
    'Source Passvault','Target Passvault',
    'Webhook Reg\nin Prod','AEM Setup\nNeeded?','Any Technical\nPrechecks',
    'JIRA Status','Build Status\nin Dev','Overall Status','Remarks',
    'Backup Name','PDD','Documentation',
    'AEM Usage\nY/N','AEM Associated\nAutoflow','AEM Topic',
    'AEM Associated\nQueue','Assoc Queue\nDEV','Assoc Queue\nTest','Assoc Queue\nProd',
    'Pre-Req\nUser Creation','Existing/New\niFlow','iFlow Version',
    'iFlow Config\nParameters','IDT Number','IDT Status',
    'Transport\nTicket (D→T)','Transport Status\n(D→T)','Transport\nTicket (T→P)',
    'Dev Consulting\nDates (CET)','Dev Consulting\nDates (IST)','Dev Consulting\nStatus',
    'Test Consulting\nDates (IST)','Test Consulting\nDates (CST)','Test Consulting\nStatus',
    'Mapping Sheet\nLink','CPI Connectivity\nCheck (Test)','UAT Status',
    'Endpoints\nBroadcasted','Certificate/\nAPI User','API User\nPassvault',
    'Prod TR Status','TR Changes\nDeployed Prod','AEM Added',
    'Overall Status\nfor Cutover','Open Activities','Manual\nConfiguration',
    'CPI Sec\nMaterial','Additional Dependent\nActivities','Scenario\nDoc Link',
    'Comments/\nRemarks','Movement To\nProd Completed','Config Check\nDone',
    'Config Check\nDoc Link','Deployed On\n(CPI DEV)','Developer\nName (CPI)',
]
NCOLS_TOTAL = len(COLS)  # 81 (col 7=Movement Needed, col 8=Movement Till Test or Prod)

# Which cols are AUTO (blue header) vs HUMAN (yellow)
AUTO = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,36,37,38,39,40,41,42,43,44,46,47,48,49,50,55,56,57,58,59,61,62,65,66,70,71,72,73,75,76,77,80,81}

def build_row(issue, full_issue, linked_stories):
    desc = full_issue.get('description','') if isinstance(full_issue, dict) else ''
    dev  = parse_dev(desc)
    s03  = parse_s03(desc)
    s04  = parse_s04(desc)
    s07  = parse_s07(desc)
    s10  = parse_s10(desc)
    s13  = parse_s13(desc)

    key       = issue.get('key','')
    jira_st   = st(issue)
    assignee  = aname(issue)
    own       = '✓' if owned(issue) else '⚠ No'
    tgl       = tglrd(issue); bgl = bglrd(issue)
    tgl_bgl   = f'{tgl} / {bgl}' if tgl or bgl else 'TBD'

    # iFlow names + IDs from Developer Section (table format preferred)
    iflow_names = dev.get('iflow_names', [])
    iflow_ids_from_table = dev.get('iflow_ids', [])  # exact IDs from |Name|ID|Version| table
    primary_iflow = iflow_names[0] if iflow_names else ''
    all_iflows_str = '\n'.join(iflow_names) if iflow_names else clean(issue.get('summary',''))

    # FIX 1 — CPI ART complete? Developer Section found AND iFlow Name filled
    dev_section_found = bool(dev)
    if not dev_section_found:
        art_complete = '⚠ MISSING — fill CPI Developer Section in ART'
    elif not iflow_names:
        art_complete = '⚠ Partial — Developer Section found but iFlow Name missing'
    else:
        art_complete = '✓ Complete'

    # CPI enrichment — use exact IDs from table if available, else fuzzy-match by name
    if not iflow_names:
        cpi = {
            'iflow_id': '', 'iflow_id_display': '',
            'build_status': '', 'existing_new': '',
            'standard_flow': '', 'deployed_on': '', 'deployed_by': '',
            'methodology_cpi': '', 'aem_confirmed': 'N',
            'has_mapping': '', 'sender_confirmed': '', 'receiver_confirmed': '',
            'manual_config': '', 'config_params': '', 'aem_autoflow': '',
            'aem_topic': '', 'aem_queue': '',
        }
    elif iflow_ids_from_table:
        # Table format: exact IDs known — use direct lookup, no fuzzy matching needed
        if len(iflow_ids_from_table) == 1:
            cpi = cpi_derive_by_id(iflow_ids_from_table[0], iflow_names[0], key)
        else:
            cpi = cpi_derive_multi_by_ids(iflow_names, iflow_ids_from_table, dev.get('version',''), key)
    elif len(iflow_names) == 1:
        # Single iFlow — standard path
        cpi = cpi_derive(iflow_names[0], key)
    else:
        # Multi-iFlow ART — aggregate across ALL iFlows
        cpi = cpi_derive_multi(iflow_names, key)
    build_st_cpi = cpi['build_status']
    iflow_id     = cpi['iflow_id_display']
    std_flow     = cpi['standard_flow']
    exist_new    = cpi['existing_new']
    meth_cpi     = cpi['methodology_cpi']
    aem_conf     = cpi['aem_confirmed']
    has_map      = cpi['has_mapping']
    manual_cfg   = cpi['manual_config']
    config_params= cpi.get('config_params','')
    deployer     = cpi.get('deployed_by','')

    # Build numbered display for multi-iFlow ARTs
    # When table format: use pre-computed tagged displays from cpi_derive_multi_by_ids
    if cpi.get('iflow_name_display'):
        iflow_name_display = cpi['iflow_name_display']
        iflow_id_display   = cpi['iflow_id_display']
        std_flow_display   = cpi.get('std_flow_display', std_flow)
        version_display    = cpi.get('version_display', '')
    elif len(iflow_names) > 1:
        # Fallback: fuzzy-matched multi-iFlow
        versions_raw = dev.get('version','').split('\n') if dev.get('version') else []
        rows_tagged = []
        for idx2, nm in enumerate(iflow_names, 1):
            art = match_iflow(nm)
            aid2 = art['id'] if art else 'Not found'
            std2 = 'Standard' if (art and art['id'].startswith('com.sap.')) else 'Custom'
            ver = versions_raw[idx2-1] if idx2-1 < len(versions_raw) else ''
            rows_tagged.append((idx2, nm, aid2, std2, ver))
        iflow_name_display = '\n'.join(f'[{r[0]}] {r[1]}' for r in rows_tagged)
        iflow_id_display   = '\n'.join(f'[{r[0]}] {r[2]}' for r in rows_tagged)
        std_flow_display   = '\n'.join(f'[{r[0]}] {r[3]}' for r in rows_tagged)
        version_display    = '\n'.join(f'[{r[0]}] {r[4]}' for r in rows_tagged if r[4])
    else:
        iflow_name_display = clean(primary_iflow) or clean(issue.get('summary',''))
        iflow_id_display   = iflow_id
        std_flow_display   = std_flow
        version_display    = dev.get('version','').split('\n')[0] if dev.get('version') else ''


    # Stream ART: find the workstream YOUR_JIRA_PROJECT that "owns" this CPI ART
    # Priority 1 — explicit YOUR_JIRA_PROJECT link without INT-CPI label
    stream_art = ''
    for s in linked_stories:
        k2 = s.get('key','')
        if k2.startswith('YOUR_JIRA_PROJECT-') and k2 != key:
            if 'INT-CPI' not in s.get('labels', []):
                stream_art = f'{k2} — {s.get("summary","")[:50]}'
                break
    # Priority 2 — scan description for YOUR_JIRA_PROJECT-NNNN references (related docs / depends on)
    if not stream_art and desc:
        for ref_key in re.findall(r'YOUR_JIRA_PROJECT-\d+', desc):
            if ref_key == key: continue
            # Check if it's in our loaded features as a non-INT-CPI feature
            ref_f = all_feats.get(ref_key)
            if ref_f and 'INT-CPI' not in lbls(ref_f):
                stream_art = f'{ref_key} — {ref_f.get("summary","")[:50]}'
                break
            elif not ref_f:
                # Referenced ART not in our fetch — treat first external YOUR_JIRA_PROJECT ref as stream ART
                stream_art = ref_key
                break

    # FIX 3 — Build Status: derive from linked YOUR_JIRA_PROJECT build story status
    # Find build story (Interface_Build label) among linked_stories
    build_story_st = ''
    for s in linked_stories:
        if s.get('key','').startswith('YOUR_JIRA_PROJECT-') and 'Interface_Build' in s.get('labels',[]):
            build_story_st = st(s)
            break
    # Prefer CPI runtime if STARTED; else use build story status; else JIRA ART status
    if build_st_cpi == 'STARTED':
        build_st_display = 'STARTED ✅'
    elif build_story_st:
        build_story_map = {'Closed':'Build Done ✅','Verification':'In Verification','In Progress':'In Progress',
                           'Development Ready':'Ready to Build','New':'Not Started'}
        build_st_display = build_story_map.get(build_story_st, build_story_st)
    elif build_st_cpi not in ('TBD',''):
        build_st_display = build_st_cpi
    else:
        build_st_display = 'TBD'

    # Overall status uses build_st_display logic
    ovr = ovr_status(jira_st, build_st_cpi)

    # Merge methodology: CPI first, fallback to §03
    methodology = meth_cpi or s03.get('pattern','P2P')

    # AEM detection — from CPI iFlow content (AdvancedEventMesh flag or JMS/AMQP signals)
    aem_final = aem_conf  # 'Y' or 'N' from cpi_derive

    # AEM cols: N/A when no AEM adapter; populated when AEM confirmed
    if aem_final == 'Y':
        _raw_topic = cpi.get('aem_topic','')
        _raw_queue = cpi.get('aem_queue','')
        aem_autoflow = cpi.get('aem_autoflow','') or 'Check iFlow adapter config in CPI Designer'
        aem_topic    = _raw_topic or 'Check iFlow adapter config in CPI Designer'
        aem_queue    = _raw_queue or 'Check iFlow adapter config in CPI Designer'
        queue_dev    = _raw_queue or 'Check iFlow adapter config in DEV'
        queue_test   = 'Configure in TEST — check iFlow adapter config'
        queue_prod   = 'Configure in PROD — check iFlow adapter config'
    else:
        aem_autoflow = 'N/A'
        aem_topic    = 'N/A'
        aem_queue    = 'N/A'
        queue_dev    = 'N/A'
        queue_test   = 'N/A'
        queue_prod   = 'N/A'

    # Webhook: Y only if Event-Driven AND NOT AEM (AEM replaces webhook registration)
    if aem_final == 'Y':
        wbhk = 'N/A — AEM inbound (AdvancedEventMesh), not HTTP webhook'
    elif methodology == 'Event-Driven' or re.search(r'webhook|autoflow|send event notification', desc, re.I):
        wbhk = 'Y'
    else:
        wbhk = 'N/A'

    # Source/Target: CPI Groovy confirms > §04
    src = cpi.get('sender_confirmed') or clean(s04.get('source','TBD'))
    tgt = cpi.get('receiver_confirmed') or clean(s04.get('target','TBD'))

    # FIX 7 — Technical Prechecks: CPI-specific checks from §13D + pattern
    tech_prechecks_parts = []
    deps = clean(s13.get('depends',''))
    if deps and deps != 'TBD': tech_prechecks_parts.append(f'Dependencies: {deps[:80]}')
    if methodology == 'Event-Driven':
        tech_prechecks_parts.append('Autoflow endpoint must be registered before TEST deploy')
        tech_prechecks_parts.append('Verify OAuth credential alias exists in target tenant')
    if 'KDD' in lbls(issue):
        tech_prechecks_parts.append('KDD approval required before PROD transport')
    tech_prechecks = '\n'.join(tech_prechecks_parts) if tech_prechecks_parts else 'None identified'

    # ── Apply business rules ──────────────────────────────────────────────────
    movement_needed = 'No' if 'CPI_No_Movement_Reqd' in lbls(issue) else 'Yes'

    # Rule 1: Movement = No → Movement Till = N/A
    if movement_needed == 'No':
        movement_till = 'N/A'
    else:
        movement_till = 'Till Test' if 'CPI_Movement_TillTest' in lbls(issue) else 'Till Prod'

    # Rule 2: always show iFlow name from Developer Section — even if not yet in CPI DEV
    has_iflow_id = bool(iflow_id_display and iflow_id_display not in ('Not found in DEV',''))

    # Rules 3 & 4: Test/Prod Cutover from Movement Till
    if movement_till == 'N/A' or 'cancelled' in jira_st.lower():
        test_cutover = 'N'; prod_cutover = 'N'
    elif movement_till == 'Till Test':
        test_cutover = 'Yes'; prod_cutover = 'No'
    else:  # Till Prod
        test_cutover = 'Yes'; prod_cutover = 'Yes'

    # Rule 5: Stream PoC = ART reporter (not §07 functional lead)
    reporter_name = ''
    if isinstance(full_issue, dict):
        rep = full_issue.get('reporter') or {}
        reporter_name = rep.get('display_name','') if isinstance(rep,dict) else ''
    stream_poc = clean(reporter_name) or clean(s07.get('func_lead','TBD'))

    # Rule 6: If iFlow ID filled → methodology = CPI (confirms it's a CPI integration)
    if has_iflow_id:
        methodology = 'CPI'

    # Rule 7: src/tgt from iFlow when ID filled (already in cpi.sender_confirmed/receiver_confirmed)
    # — already applied above via cpi dict

    # Rule 8: Build Status = YOUR_JIRA_PROJECT build story status (already in build_st_display)
    # — already applied above via build_story_st
    cet      = dev.get('consult_dev','TBD')
    ist_dev  = cet_to_ist(cet)
    ist_test = dev.get('consult_test','TBD')
    cst_test = ist_to_cst(ist_test)

    # FIX 5 — Version: clean semver only (first iFlow)
    raw_ver = dev.get('version','TBD')
    ver0 = raw_ver.split('\n')[0] if raw_ver else 'TBD'

    story_keys = ', '.join(
        s['key'] for s in linked_stories if s.get('key','').startswith('YOUR_JIRA_PROJECT-')
    ) if linked_stories else ''

    return [
        stream_art,                                              # 01 Stream ART (linked workstream YOUR_JIRA_PROJECT)
        key,                                                     # 02 CPI ART (YOUR_JIRA_PROJECT-XXXX with INT-CPI label)
        story_keys,                                              # 03 JIRA Story/Bug/Task
        ws(issue),                                               # 04 Workstream/Sub Topic
        rd_rel(issue),                                           # 05 RD07/RD08
        exp_rel(issue),                                          # 06 Expected Release
        'No' if 'CPI_No_Movement_Reqd' in lbls(issue) else 'Yes', # 07 Movement Needed ← label
        movement_till,                                           # 08 Movement Till Test or Prod ← rule 1
        tgl_bgl,                                                 # 09 TGL/BGL
        clean(primary_iflow) or clean(issue.get('summary','')), # 10 Scenario
        assignee,                                                # 11 Responsible
        iflow_name_display,                                      # 12 iFlow Name ← blank if no ID (rule 2)
        iflow_id_display,                                        # 13 iFlow ID (numbered if multi)
        art_complete,                                            # 14 CPI ART Complete?
        std_flow_display,                                        # 15 Standard/Custom
        own,                                                     # 16 CPI Owner
        ws(issue),                                               # 17 Workstream (explicit)
        test_cutover,                                            # 18 Test Cutover ← rules 3&4
        prod_cutover,                                            # 19 Prod Cutover ← rules 3&4
        stream_poc,                                              # 20 Stream PoC ← ART reporter (rule 5)
        is_perf(issue, desc),                                    # 21 Perf Relevant
        methodology,                                             # 22 Integration Methodology ← rule 6: CPI if iFlow ID filled
        ws(issue),                                               # 21 Workstream (repeat)
        src,                                                     # 22 Source System  ← CPI
        tgt,                                                     # 23 Target System  ← CPI
        clean(s07.get('src_sme','TBD')),                         # 24 Source POC
        clean(s07.get('tgt_sme','TBD')),                         # 25 Target POC
        clean(s10.get('pv_src','TBD')),                          # 26 Source Passvault
        clean(s10.get('pv_src','TBD')),                          # 27 Target Passvault
        wbhk,                                                    # 28 Webhook  ← CPI
        aem_final,                                               # 29 AEM Setup  ← CPI
        tech_prechecks,                                          # 30 Technical Prechecks  ← FIX 7
        jira_st,                                                 # 31 JIRA Status
        build_st_display,                                        # 32 Build Status  ← FIX 3
        ovr,                                                     # 33 Overall Status
        clean(s13.get('assumptions',''))[:80],                   # 34 Remarks
        '',                                                      # 35 Backup Name  HUMAN
        RELEASE_PDD,                                             # 36 PDD
        dev.get('doc','TBD'),                                    # 37 Documentation
        aem_final,                                               # 38 AEM Usage Y/N  ← CPI
        aem_autoflow,                                            # 39 AEM Autoflow  ← FIX 4
        aem_topic,                                               # 40 AEM Topic  ← FIX 4
        aem_queue,                                               # 41 AEM Queue  ← FIX 4
        queue_dev,                                               # 42 Queue DEV  ← FIX 4
        queue_test,                                              # 43 Queue Test  ← FIX 4
        queue_prod,                                              # 44 Queue Prod  ← FIX 4
        'Y' if s10.get('auth') else 'TBD',                      # 45 Pre-req User
        exist_new,                                               # 46 Exist/New  ← CPI
        version_display,                                         # 47 Version (numbered if multi)
        config_params,                                           # 48 Config Params  ← FIX 5
        dev.get('idt_no','TBD'),                                 # 49 IDT No
        '',                                                      # 50 IDT Status  HUMAN
        '',                                                      # 51 Transport D→T  HUMAN
        '',                                                      # 52 TR Status D→T  HUMAN
        '',                                                      # 53 Transport T→P  HUMAN
        cet,                                                     # 54 Dev CET
        ist_dev,                                                 # 55 Dev IST  ← converted
        dev.get('consult_status','TBD'),                         # 56 Dev Status
        ist_test,                                                # 57 Test IST
        cst_test,                                                # 58 Test CST  ← converted
        '',                                                      # 59 Test Status  HUMAN
        has_map,                                                 # 60 Mapping Sheet  ← CPI
        '',                                                      # 61 CPI Connectivity  HUMAN
        '',                                                      # 62 UAT Status  HUMAN
        '',                                                      # 63 Endpoints  HUMAN
        clean(s10.get('auth','OAuth 2.0')),                      # 64 Cert/API User
        clean(s10.get('pv_src','TBD')),                          # 65 API PV
        '',                                                      # 66 Prod TR  HUMAN
        '',                                                      # 67 TR Deployed  HUMAN
        '',                                                      # 68 AEM Added  HUMAN
        ovr,                                                     # 69 Overall Cutover Status
        clean(s13.get('blocks','None'))[:80],                    # 70 Open Activities
        manual_cfg,                                              # 71 Manual Config  ← CPI
        clean(s10.get('auth','')+' — both directions') if s10.get('auth') else 'TBD',  # 72 CPI Sec
        clean(s13.get('depends',''))[:100],                      # 73 Additional Deps
        clean(dev.get('scenario_doc','')),                       # 74 Scenario Doc
        '',                                                      # 75 Comments  HUMAN
        '',                                                      # 76 Movement  HUMAN
        '',                                                      # 77 Config Done  HUMAN
        '',                                                      # 78 Config Doc  HUMAN
        cpi.get('deployed_on',''),                               # 79 Deployed On  ← CPI
        deployer,                                                # 80 Developer Name  ← FIX 6
    ]

# ── JIRA DATA ─────────────────────────────────────────────────────────────────
print('='*55, flush=True)
print(f'{RELEASE_NAME} Cutover — 78-col + CPI enrichment', flush=True)
print(f'PDD: {RELEASE_PDD}  |  Go-Live: {RELEASE_GOLIVE}  |  {RELEASE_PI}', flush=True)
print('='*55, flush=True)

print('\n[JIRA]', flush=True)
# ── Two complementary queries — primary fixVersion + safety net ───────────────
feat_fv = search_all(
    f'project=YOUR_JIRA_PROJECT AND issuetype=Feature AND labels="INT-CPI" '
    f'AND labels in ("YOUR-TEAM-LABEL") AND fixVersion="{RELEASE_FV}" '
    f'AND status not in (Obsolete,Cancelled) ORDER BY key ASC',
    f'{RELEASE_NAME} INT-CPI ARTs (fixVersion={RELEASE_FV})')

feat_nofv = search_all(
    'project=YOUR_JIRA_PROJECT AND issuetype=Feature AND labels="INT-CPI" '
    'AND labels in ("YOUR-TEAM-LABEL") AND fixVersion is EMPTY '
    'AND status not in (Obsolete,Cancelled,"Handed Over",Done) ORDER BY key ASC',
    f'{RELEASE_NAME} INT-CPI ARTs (no fixVersion — safety net)')

maxatt_f  = search_all('project=YOUR_JIRA_PROJECT AND issuetype=Feature AND labels in ("MAX_ATTENTION","MaxAttention") AND status not in (Obsolete,"Handed Over") ORDER BY key ASC','MaxAtt feat')
maxatt_s  = search_all('project=YOUR_JIRA_PROJECT AND issuetype=Story AND labels in ("MAX_ATTENTION","MaxAttention") AND status not in (Closed,Obsolete) ORDER BY key ASC','MaxAtt stories')

all_feats = {f['key']:f for f in feat_fv+feat_nofv+maxatt_f}
print(f'  Total unique ARTs loaded: {len(all_feats)}', flush=True)

print('\n[Full ART descriptions]', flush=True)
full = {}
for i,k in enumerate(all_feats,1):
    full[k] = get_issue(k)
    print(f'  [{i}/{len(all_feats)}] {k}', flush=True)

print('\n[Linked issues per feature — stories + Stream ARTs]', flush=True)
linked = {}
def _parse_issues(r):
    c = r.get('result',{}).get('content',[])
    if not c: return []
    try: return json.loads(c[0]['text']).get('issues',[])
    except: return []

for k in all_feats:
    all_linked = []
    seen_keys = set()

    def _add(issues):
        for i in issues:
            kk = i.get('key','')
            if kk and kk not in seen_keys:
                seen_keys.add(kk); all_linked.append(i)

    # 1) Explicit JIRA links — stories
    _add(_parse_issues(jira_mcp('jira_search',{'jql':f'issue in linkedIssues({k}) AND project=YOUR_JIRA_PROJECT AND issuetype=Story','limit':50})))
    # 2) Child stories via "Epic Link" (classic JIRA hierarchy — Feature as Epic)
    _add(_parse_issues(jira_mcp('jira_search',{'jql':f'"Epic Link"={k} AND project=YOUR_JIRA_PROJECT AND issuetype=Story','limit':50})))
    # 3) Child stories via parent field (next-gen JIRA hierarchy)
    _add(_parse_issues(jira_mcp('jira_search',{'jql':f'parent={k} AND project=YOUR_JIRA_PROJECT AND issuetype=Story','limit':50})))
    # 4) Linked YOUR_JIRA_PROJECT features (for Stream ART detection — non-INT-CPI parent)
    _add(_parse_issues(jira_mcp('jira_search',{'jql':f'issue in linkedIssues({k}) AND project=YOUR_JIRA_PROJECT AND key != {k}','limit':10})))

    if all_linked:
        linked[k] = all_linked

def classify(f):
    ls=lbls(f)
    # MaxAtt check first (some may overlap)
    if any(l.lower() in ('max_attention','maxattention') for l in ls): return 'MaxAtt'
    # All INT-CPI active features = RD08 scope (team-defined, labels unreliable)
    if 'INT-CPI' in ls: return 'RD08'
    return 'Other'

print('\n[Building flat row list]', flush=True)

# ── Build flat ordered list — no groups ───────────────────────────────────────
# Rule:
#   SECTION 1: For each RD08 INT-CPI ART — ART row, then each linked YOUR_JIRA_PROJECT story row
#   SECTION 2: YOUR_JIRA_PROJECT RD08 Interface_Build stories that have NO linked CPI ART
#   SECTION 3: MaxAtt ARTs (YOUR_JIRA_PROJECT) then their linked YOUR_JIRA_PROJECT stories
#   (Orphan open stories excluded per user request — they have no ART scope)

rd08_feat_keys_set = {f['key'] for f in all_feats.values() if classify(f)=='RD08'}
linked_teams_keys = set()  # track all story keys already placed under an ART

flat_rows = []  # each item: (issue, full_issue, linked_list, row_type)

# ── SECTION 1: Release ARTs + their YOUR_JIRA_PROJECT stories ────────────────────────
for f in [v for v in all_feats.values() if classify(v)=='RD08']:
    fk = f['key']
    fi = full.get(fk, {})
    all_linked = linked.get(fk, [])
    flat_rows.append((f, fi, all_linked, 'ART'))
    # No story rows — Feature only

# ── SECTION 2: REMOVED — Features only, no orphan stories ────────────────────
print(f'  Section 2 — REMOVED (Feature only mode)', flush=True)
# ── SECTION 3: MaxAtt Features only (no stories) ─────────────────────────────
for f in [v for v in all_feats.values() if classify(v)=='MaxAtt']:
    fk = f['key']
    fi = full.get(fk, {})
    all_linked = linked.get(fk, [])
    flat_rows.append((f, fi, all_linked, 'MAXATT_ART'))
    # No story rows — Feature only

print(f'  Section 1 — {RELEASE_NAME} ARTs (Features):  {sum(1 for r in flat_rows if r[3]=="ART")} rows', flush=True)
print(f'  Section 3 — MaxAtt ARTs (Features):{sum(1 for r in flat_rows if r[3]=="MAXATT_ART")} rows', flush=True)
print(f'  TOTAL ROWS: {len(flat_rows)}', flush=True)

print('\n[CPI enrichment preview]', flush=True)
for issue,fi,ls,rtype in flat_rows:
    if rtype == 'ART':
        dev=parse_dev(fi.get('description','') if fi else '')
        names=dev.get('iflow_names',[])
        if names:
            a=match_iflow(names[0])
            print(f'  {issue["key"]} → "{names[0][:38]}" → {"MATCHED: "+a["id"][:38] if a else "NOT FOUND"}', flush=True)

# ── EXCEL ──────────────────────────────────────────────────────────────────────
print('\n[Building Excel]', flush=True)

C = {
    'dk':'1F4E79','mid':'2E75B6',
    'r1_art':'D6EAF8','r2_art':'EBF3FB',         # ART rows — blue tint
    'r1_story':'FFFFFF','r2_story':'F5FBFF',      # Story rows under ART — white/pale
    'r1_no_art':'FEF9E7','r2_no_art':'FFFDF0',    # Orphan RD08 stories — amber tint
    'r1_maxatt':'FEF9E7','r2_maxatt':'FFFDF0',    # MaxAtt — amber tint
    'bad':'FFCCCC','warn':'FFF3CD','ok':'D5F5E3','cancel':'F0F0F0',
    'auto':'D6EAF8','human':'FEF9E7',
}
JIRA_URL=os.environ.get('JIRA_BASE_URL', 'https://jira.<YOUR-DOMAIN>') + '/browse/'

def fl(h): return PatternFill('solid',fgColor=h)
def fn(bold=False,color='000000',sz=8,ul=None): return Font(bold=bold,color=color,size=sz,name='Calibri',underline=ul)
def al(wrap=True,h='left',v='center'): return Alignment(wrapText=wrap,horizontal=h,vertical=v)
def bd():
    s=Side(style='thin',color='CCCCCC')
    return Border(left=s,right=s,top=s,bottom=s)

def row_color(issue, rtype, idx):
    s=st(issue).lower()
    if 'blocked' in s: return fl(C['warn'])
    if 'cancelled' in s: return fl(C['cancel'])
    if 'done' in s or 'closed' in s or 'completed' in s: return fl(C['ok'])
    if not owned(issue): return fl(C['bad'])
    if rtype == 'ART':        return fl(C['r1_art'] if idx%2==0 else C['r2_art'])
    if rtype == 'STORY':      return fl(C['r1_story'] if idx%2==0 else C['r2_story'])
    if rtype == 'STORY_NO_ART': return fl(C['r1_no_art'] if idx%2==0 else C['r2_no_art'])
    return fl(C['r1_maxatt'] if idx%2==0 else C['r2_maxatt'])

wb = openpyxl.Workbook()

# ── GUIDE ─────────────────────────────────────────────────────────────────────
wg = wb.active; wg.title='Guide'; wg.sheet_view.showGridLines=False
wg.column_dimensions['A'].width=30; wg.column_dimensions['B'].width=60
rows=[
    (f'{RELEASE_NAME} — CPI Integration Cutover  |  PDD: {RELEASE_PDD}  |  Go-Live: {RELEASE_GOLIVE}',True,C['dk'],'FFFFFF',12),
    (f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}  |  {RELEASE_PI}',False,'EBF3FB','1F4E79',9),
    ('',False,None,None,9),
    ('COLOUR LEGEND',True,C['dk'],'FFFFFF',10),
    ('Red','Not CPI-owned — assign or confirm SAP ownership',False,C['bad'],None,9),
    ('Amber','Blocked / At-risk',False,C['warn'],None,9),
    ('Green','Completed / Done / On Track',False,C['ok'],None,9),
    ('Grey','Cancelled',False,C['cancel'],None,9),
    ('Blue header','Column auto-populated (JIRA + CPI)',False,C['auto'],None,9),
    ('Yellow header','Column requires human input',False,C['human'],None,9),
    ('',False,None,None,9),
    ('CPI ENRICHMENT LOGIC',True,C['dk'],'FFFFFF',10),
    ('Step 1','JIRA jira_get_issue → parse Developer Section + §03/04/07/10/13D',False,'F0F4FF',None,9),
    ('Step 2','CPI get_runtime_artifacts (1 call) → fuzzy match iFlow name → iFlow ID + status',False,'F0F4FF',None,9),
    ('Step 3','CPI get_iflow_content → bpmnSteps + scripts + mappings → methodology, AEM, source/target confirm',False,'F0F4FF',None,9),
    ('Step 4','Synthesise → Existing/New, Standard/Custom, Webhook, Manual Config, IST/CST conversion',False,'F0F4FF',None,9),
]
for ri,(label,*rest) in enumerate(rows,1):
    if len(rest)==5: bold,bg,fg,sz=rest[0],rest[1],rest[2],rest[3]
    else: bold,bg,fg,sz=False,None,None,9
    if isinstance(label,tuple): label,val=label
    else: val=rest[4] if len(rest)>4 and isinstance(rest[4],str) and rest[4] else None
    c=wg.cell(row=ri,column=1,value=label)
    c.font=fn(bold=bold,color=fg or '000000',sz=sz)
    if bg: c.fill=fl(bg)
    c.alignment=al(wrap=False)
    if val:
        c2=wg.cell(row=ri,column=2,value=val)
        c2.font=fn(sz=sz); c2.alignment=al(wrap=True)
        if bg: c2.fill=fl(bg)
    if bold:
        wg.merge_cells(start_row=ri,start_column=1,end_row=ri,end_column=2)
        wg.cell(row=ri,column=1).alignment=al(wrap=False,h='center')

# ── MAIN SHEET ────────────────────────────────────────────────────────────────
wsh=wb.create_sheet(SHEET_NAME); wsh.sheet_view.showGridLines=False; wsh.freeze_panes='A4'
NCOLS=NCOLS_TOTAL

wsh.merge_cells(start_row=1,start_column=1,end_row=1,end_column=NCOLS)
tc=wsh.cell(row=1,column=1,value=f'{RELEASE_NAME} — CPI Integration Cutover Tracking Sheet  |  82 Columns  |  {datetime.now().strftime("%Y-%m-%d")}')
tc.fill=fl(C['dk']); tc.font=fn(bold=True,color='FFFFFF',sz=11); tc.alignment=al(wrap=False,h='center')
wsh.row_dimensions[1].height=22

# Row 2 — col numbers with auto/human colour
for ci in range(1,NCOLS+1):
    c=wsh.cell(row=2,column=ci,value=ci)
    c.fill=fl(C['auto'] if ci in AUTO else C['human'])
    c.font=fn(bold=True,sz=7,color='1F4E79' if ci in AUTO else '7A3F00')
    c.alignment=al(wrap=False,h='center'); c.border=bd()
wsh.row_dimensions[2].height=11

# Row 3 — column headers
for ci,col in enumerate(COLS,1):
    c=wsh.cell(row=3,column=ci,value=col)
    c.fill=fl(C['auto'] if ci in AUTO else C['human'])
    c.font=fn(bold=True,sz=8,color='1F4E79' if ci in AUTO else '7A3F00')
    c.alignment=al(wrap=True,h='center'); c.border=bd()
wsh.row_dimensions[3].height=36

# (rows written later via write_flat)

# ── Col widths (shared) ───────────────────────────────────────────────────────
cw={1:14,2:14,3:22,4:12,5:8,6:12,7:18,8:40,9:24,10:40,11:40,12:9,13:8,
    14:8,15:8,16:22,17:8,18:14,19:12,20:22,21:22,22:22,23:22,24:20,25:20,
    26:10,27:8,28:28,29:16,30:12,31:12,32:28,33:16,34:12,35:12,36:8,37:22,
    38:16,39:18,40:16,41:16,42:16,43:12,44:10,45:14,46:22,47:12,48:14,
    49:18,50:16,51:18,52:22,53:22,54:18,55:22,56:20,57:16,58:22,59:14,
    60:14,61:14,62:16,63:18,64:14,65:14,66:10,67:14,68:28,69:35,70:24,
    71:28,72:40,73:20,74:14,75:14,76:22,77:12,78:14,79:12,80:22}

# ── Sheet helpers ─────────────────────────────────────────────────────────────
def make_sheet_header(ws_target, title_text):
    ws_target.sheet_view.showGridLines=False
    ws_target.freeze_panes='A4'
    ws_target.merge_cells(start_row=1,start_column=1,end_row=1,end_column=NCOLS)
    tc=ws_target.cell(row=1,column=1,value=title_text)
    tc.fill=fl(C['dk']); tc.font=fn(bold=True,color='FFFFFF',sz=11)
    tc.alignment=al(wrap=False,h='center'); ws_target.row_dimensions[1].height=22
    for ci in range(1,NCOLS+1):
        c=ws_target.cell(row=2,column=ci,value=ci)
        c.fill=fl(C['auto'] if ci in AUTO else C['human'])
        c.font=fn(bold=True,sz=7,color='1F4E79' if ci in AUTO else '7A3F00')
        c.alignment=al(wrap=False,h='center'); c.border=bd()
    ws_target.row_dimensions[2].height=11
    for ci,col in enumerate(COLS,1):
        c=ws_target.cell(row=3,column=ci,value=col)
        c.fill=fl(C['auto'] if ci in AUTO else C['human'])
        c.font=fn(bold=True,sz=8,color='1F4E79' if ci in AUTO else '7A3F00')
        c.alignment=al(wrap=True,h='center'); c.border=bd()
    ws_target.row_dimensions[3].height=36
    for ci,w in cw.items():
        ws_target.column_dimensions[get_column_letter(ci)].width=w

def write_flat(ws_target, row_set, start_row=4):
    dr_local=start_row
    for idx,(issue,fi,ls,rtype) in enumerate(row_set):
        try:
            vals=build_row(issue, fi if fi else issue, ls)
        except Exception as e:
            print(f'  WARN {issue.get("key","?")}: {e}', flush=True)
            vals=['']+[issue.get('key','ERR')]+['']*78
        row_f=row_color(issue,rtype,idx)
        for ci,v in enumerate(vals,1):
            c=ws_target.cell(row=dr_local,column=ci,value=str(v) if v else '')
            c.fill=row_f; c.font=fn(sz=8)
            c.alignment=al(wrap=(ci in (3,8,10,11,20,21,28,30,32,46,69,70,71,72,74)))
            c.border=bd()
            if ci==1 and v:
                m=re.match(r'(YOUR_JIRA_PROJECT-\d+)',str(v))
                if m:
                    c.hyperlink=JIRA_URL+m.group(1)
                    c.font=Font(underline='single',color='0563C1',sz=8,name='Calibri')
            if ci==2 and v:
                c.hyperlink=JIRA_URL+str(v)
                c.font=Font(underline='single',color='0563C1',sz=8,name='Calibri')
            if ci==74 and v and str(v).startswith('http'):
                c.hyperlink=str(v)
                c.font=Font(underline='single',color='0563C1',sz=8,name='Calibri')
        ws_target.row_dimensions[dr_local].height=30; dr_local+=1
    return dr_local

# ── Split rows ────────────────────────────────────────────────────────────────
rd08_rows   = [(i,fi,ls,rt) for i,fi,ls,rt in flat_rows if rt == 'ART']  # named rd08_rows for compat
maxatt_rows = [(i,fi,ls,rt) for i,fi,ls,rt in flat_rows if rt == 'MAXATT_ART']

# ── Pre-compute Master List rows from build_row (single pass, reuse all logic) ─
# Col indices (1-based): 6=Expected Release, 10=iFlow Name, 13=Std/Custom, 38=AEM Usage
# JMS: separate check from cache (not in main cols)
master_list_data = []
for issue,fi,ls,rtype in flat_rows:
    if rtype not in ('ART','MAXATT_ART'): continue
    try:
        vals = build_row(issue, fi if fi else issue, ls)
    except Exception:
        continue
    is_maxatt = any(l.lower() in ('max_attention','maxattention') for l in lbls(issue))
    # Extract iFlow names — may be multi-line [1] tagged or plain
    iflow_col = str(vals[9]) if len(vals) > 9 else ''   # col 10 (0-indexed: 9)
    release_col = str(vals[5]) if len(vals) > 5 else '' # col 6 (0-indexed: 5)
    aem_col  = str(vals[37]) if len(vals) > 37 else ''  # col 38 (0-indexed: 37)
    std_col  = str(vals[12]) if len(vals) > 12 else ''  # col 13 (0-indexed: 12)
    exist_col= str(vals[45]) if len(vals) > 45 else ''  # col 46 (0-indexed: 45)

    # Release: use the fixVersion query value directly — this is what JIRA shows
    # as "Version / Delivery" field. ARTs returned by fixVersion=RELEASE_FV ARE that release.
    # Safety net ARTs (no fixVersion) fallback to TGLRD label parsing.
    if rtype == 'ART':
        release_val = RELEASE_FV  # e.g. "RD08.26"
    else:
        tgl_lbl = tglrd(issue)
        m_tgl = re.match(r'TGLRD(\d+)\.(\d+)', tgl_lbl, re.I) if tgl_lbl else None
        release_val = f'RD{m_tgl.group(1)}.{m_tgl.group(2)}' if m_tgl else RELEASE_FV

    # For multi-iFlow rows: split into one master row per iFlow
    iflow_lines = iflow_col.split('\n') if '\n' in iflow_col else [iflow_col]
    std_lines   = std_col.split('\n')   if '\n' in std_col   else [std_col] * len(iflow_lines)
    # AEM and JMS per iFlow — check cache
    dev_parsed  = parse_dev(fi.get('description','') if isinstance(fi,dict) else '')
    iflow_ids_ml = dev_parsed.get('iflow_ids', [])
    aem_vals, jms_vals = [], []
    for i_idx, nm_raw in enumerate(iflow_lines):
        nm_clean = re.sub(r'^\[\d+\]\s*','', nm_raw).strip()
        aid = iflow_ids_ml[i_idx] if i_idx < len(iflow_ids_ml) else ''
        cached = _IFLOW_CONTENT_DB.get(aid, {}) if aid else {}
        if not cached and nm_clean:
            art_m = match_iflow(nm_clean)
            if art_m: cached = _IFLOW_CONTENT_DB.get(art_m['id'],{})
        scripts_lower = ' '.join(cached.get('scripts',{}).values()).lower()
        steps_lower   = ' '.join(cached.get('bpmnSteps',[])).lower()
        aem_v = 'Y' if cached.get('has_aem_adapter') or 'advancedeventmesh' in steps_lower else 'N'
        jms_v = 'Y' if any(k in scripts_lower for k in ['javax.jms','jms://','jmsqueue','activemq']) else 'N'
        aem_vals.append(aem_v); jms_vals.append(jms_v)

    for i_idx, nm_raw in enumerate(iflow_lines):
        nm_clean = re.sub(r'^\[\d+\]\s*','', nm_raw).strip()
        if not nm_clean: continue
        std_v = re.sub(r'^\[\d+\]\s*','', std_lines[i_idx] if i_idx < len(std_lines) else std_col).strip()
        master_list_data.append({
            'iflow': nm_clean,
            'maxatt': 'Yes' if is_maxatt else 'No',
            'existing': 'Existing' if exist_col in ('Existing','[1]') or 'Existing' in exist_col else 'New',
            'std': std_v or 'Custom',
            'release': release_val,
            'aem': aem_vals[i_idx] if i_idx < len(aem_vals) else 'N',
            'jms': jms_vals[i_idx] if i_idx < len(jms_vals) else 'N',
            'rtype': rtype,
        })

# ── Write RD08 Sheet (already created above as wsh) ──────────────────────────
write_flat(wsh, rd08_rows, start_row=4)
# Apply col widths to wsh (cw defined above)
for ci,w in cw.items():
    wsh.column_dimensions[get_column_letter(ci)].width=w

# ── MaxAtt Sheet ──────────────────────────────────────────────────────────────
wma=wb.create_sheet('MaxAtt Sheet')
make_sheet_header(wma,
    f'MaxAttention — CPI Integration Tracking  |  PDD: {RELEASE_PDD}  |  Go-Live: {RELEASE_GOLIVE}  |  {len(maxatt_rows)} rows')
write_flat(wma, maxatt_rows, start_row=4)


# ── VALIDATION SHEET ──────────────────────────────────────────────────────────
wv=wb.create_sheet('CPI Enrichment Validation'); wv.sheet_view.showGridLines=False
wv.merge_cells('A1:H1')
c=wv.cell(row=1,column=1,value='CPI Enrichment Validation — What was auto-populated from CPI DEV')
c.fill=fl(C['dk']); c.font=fn(bold=True,color='FFFFFF',sz=11); c.alignment=al(wrap=False,h='center')
vh=['ART Key','iFlow Name (from Dev Section)','iFlow ID (CPI Match)','Build Status','Std/Custom','Method (CPI)','AEM Confirmed','Mapping File']
for ci,h in enumerate(vh,1):
    c=wv.cell(row=2,column=ci,value=h)
    c.fill=fl(C['mid']); c.font=fn(bold=True,color='FFFFFF',sz=9)
    c.alignment=al(wrap=False,h='center'); c.border=bd()

vr=3
art_rows = [(issue,fi,ls) for issue,fi,ls,rtype in flat_rows if rtype in ('ART','MAXATT_ART')]
for f,fi,ls in art_rows:
    desc=fi.get('description','') if fi else ''
    dev=parse_dev(desc)
    names=dev.get('iflow_names',[])
    for nm in (names if names else [clean(f.get('summary',''))]):
        cpi=cpi_derive(nm,f['key'])
        row_f=fl('D5F5E3') if cpi['build_status']=='STARTED' else fl('FFF3CD') if cpi['iflow_id'] else fl('FFCCCC')
        vals=[f['key'],nm[:60],cpi['iflow_id_display'][:50],cpi['build_status'],cpi['standard_flow'],cpi['methodology_cpi'],cpi['aem_confirmed'],cpi['has_mapping'][:40]]
        for ci,v in enumerate(vals,1):
            c=wv.cell(row=vr,column=ci,value=v)
            c.fill=row_f; c.font=fn(sz=9); c.alignment=al(wrap=False); c.border=bd()
        vr+=1

for i,w in enumerate([14,55,50,12,10,14,10,30],1):
    wv.column_dimensions[get_column_letter(i)].width=w

# ── TEAM ─────────────────────────────────────────────────────────────────────
wt=wb.create_sheet('CPI Team'); wt.sheet_view.showGridLines=False
wt.merge_cells('A1:E1')
c=wt.cell(row=1,column=1,value=f'CPI Integration Team — {RELEASE_NAME}')
c.fill=fl(C['dk']); c.font=fn(bold=True,color='FFFFFF',sz=11); c.alignment=al(wrap=False,h='center')
for ci,h in enumerate(['Name','Email','SAP User-ID','Role','Notes'],1):
    c=wt.cell(row=2,column=ci,value=h); c.fill=fl(C['mid']); c.font=fn(bold=True,color='FFFFFF',sz=9); c.alignment=al(wrap=False,h='center'); c.border=bd()
team=[(m['name'],m.get('email',''),m['cid'],m.get('role','CPI Developer'),'') for m in _TEAM]
for ri,m in enumerate(team,3):
    rf2=fl(C['r1_art'] if ri%2==0 else C['r2_art'])
    for ci,v in enumerate(m,1):
        c=wt.cell(row=ri,column=ci,value=v); c.fill=rf2; c.font=fn(sz=10); c.alignment=al(wrap=False); c.border=bd()
for i,w in enumerate([28,35,14,22,20],1): wt.column_dimensions[get_column_letter(i)].width=w

# ── iFlow Master List sheet (built from pre-computed master_list_data) ────────
wml = wb.create_sheet('iFlow Master List'); wml.sheet_view.showGridLines=False
wml.freeze_panes = 'A3'

ML_COLS   = ['iFlow Name','Max Attention\nChanges','New/Existing','Standard/Custom',
             'Release','AEM Usage\nY/N','JMS Usage\nY/N','Criticality\nH/M/L']
ML_WIDTHS = [55, 14, 12, 14, 10, 10, 10, 12]

wml.merge_cells(start_row=1,start_column=1,end_row=1,end_column=len(ML_COLS))
tc=wml.cell(row=1,column=1,value=f'{RELEASE_NAME} — iFlow Master List  |  {len(master_list_data)} iFlows  |  {datetime.now().strftime("%Y-%m-%d")}')
tc.fill=fl(C['dk']); tc.font=fn(bold=True,color='FFFFFF',sz=11)
tc.alignment=al(wrap=False,h='center'); wml.row_dimensions[1].height=20

for ci,h in enumerate(ML_COLS,1):
    c=wml.cell(row=2,column=ci,value=h)
    c.fill=fl(C['mid']); c.font=fn(bold=True,color='FFFFFF',sz=9)
    c.alignment=al(wrap=True,h='center'); c.border=bd()
wml.row_dimensions[2].height=30

for ml_row_idx,row in enumerate(master_list_data,3):
    is_maxatt = row['maxatt']=='Yes'
    std_v     = row['std']
    if is_maxatt:
        row_f_ml = fl('FFCCCC')
    elif std_v == 'Standard':
        row_f_ml = fl('EBF3FB' if ml_row_idx%2==0 else 'FFFFFF')
    else:
        row_f_ml = fl('F5FBFF' if ml_row_idx%2==0 else 'FFFFFF')

    vals_ml = [row['iflow'], row['maxatt'], row['existing'], std_v,
               row['release'], row['aem'], row['jms'], '']
    for ci,v in enumerate(vals_ml,1):
        c=wml.cell(row=ml_row_idx,column=ci,value=v)
        c.fill=row_f_ml; c.font=fn(sz=9)
        c.alignment=al(wrap=False,h='center' if ci>1 else 'left')
        c.border=bd()
        if ci in (6,7) and v=='Y':
            c.fill=fl(C['warn']); c.font=fn(bold=True,sz=9)
    wml.row_dimensions[ml_row_idx].height=16

for i,w in enumerate(ML_WIDTHS,1):
    wml.column_dimensions[get_column_letter(i)].width=w

# Sheet order
for idx,name in enumerate([f'Guide',SHEET_NAME,'iFlow Master List',f'MaxAtt Sheet',f'CPI Enrichment Validation',f'CPI Team']):
    if name in wb.sheetnames: wb.move_sheet(name,offset=idx-wb.index(wb[name]))

out=os.path.join(os.path.expanduser('~'),'Downloads',f'{RELEASE_NAME} Cutover {_next_version()}.xlsx')
wb.save(out)
print(f'\nSAVED: {out}', flush=True)
wb2=openpyxl.load_workbook(out)
for sn in wb2.sheetnames:
    ws2=wb2[sn]; print(f'  {sn}: {ws2.max_row}r x {ws2.max_column}c', flush=True)
print(f'\nSUMMARY', flush=True)
print(f'  {SHEET_NAME} — INT-CPI Features:  {len(rd08_rows)}', flush=True)
print(f'  MaxAtt Sheet — MaxAtt Features: {len(maxatt_rows)}', flush=True)
print(f'  TOTAL:                          {len(flat_rows)}', flush=True)
