// src/utils/adapterParser.ts
// Extracts sender/receiver adapter configurations from a CPI iFlow ZIP buffer.
//
// Real BPMN2 structure (learned from live iFlow):
//   Adapters live in <bpmn2:messageFlow> elements, NOT <bpmn2:participant>.
//   Properties use <ifl:property><key>X</key><value>Y</value></ifl:property>
//   child elements, NOT XML attributes.
//
// Key property names observed in the wild:
//   ComponentType          → adapter type  (HTTP, HTTPS, AdvancedEventMesh, SOAP, SFTP, Mail…)
//   direction              → Sender | Receiver
//   Name                   → channel display name
//   system                 → target participant name
//   httpAddressWithoutQuery→ full URL (HTTP/HTTPS receiver)
//   urlPath                → inbound path  (HTTPS sender)
//   host                   → broker URL    (AEM, SFTP, Mail)
//   privateKeyAlias        → client-cert credential alias
//   keyStoreAlias          → keystore alias (AEM)
//   credentialName         → basic-auth credential alias
//   authenticationMethod   → Client Certificate | BasicAuthentication | OAuth2…
//   senderAuthType         → RoleBased | ClientCertificate (sender side)
//   httpMethod             → GET | POST | PATCH…
//   endpointType           → QUEUE | TOPIC (AEM)
//   destinationName        → queue/topic name (AEM)
//   messageVpn             → VPN name (AEM)
//   userRole               → required role (HTTPS sender)

import AdmZip from 'adm-zip';
import { AdapterConfig } from '../types';

// ── Extract BPMN2 XML from iFlow ZIP ─────────────────────────────────────────
export function extractBpmnXml(zipBuffer: Buffer): string | null {
  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const bpmnEntry = entries.find((e) =>
      e.entryName.endsWith('.iflw') ||
      e.entryName.includes('flowDefinition') ||
      (e.entryName.endsWith('.xml') && !e.entryName.includes('META-INF'))
    );
    if (!bpmnEntry) return null;
    return bpmnEntry.getData().toString('utf-8');
  } catch { return null; }
}

// ── Parse all ifl:property key/value pairs from an XML block ─────────────────
function extractProps(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  // Matches: <ifl:property> <key>X</key> <value>Y</value> </ifl:property>
  // value can be empty, multi-line, or contain encoded HTML entities
  const re = /<ifl:property[^>]*>\s*<key>([^<]+)<\/key>\s*<value>([\s\S]*?)<\/value>\s*<\/ifl:property>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const key = m[1].trim();
    const val = m[2].trim()
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    props[key] = val;
  }
  return props;
}

// ── Derive host from a URL string ─────────────────────────────────────────────
function hostFromUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') || url.startsWith('tcps') || url.startsWith('tcp')
      ? url
      : 'https://' + url);
    return u.hostname + (u.port ? `:${u.port}` : '');
  } catch {
    // fallback: strip scheme and path
    return url.replace(/^[a-z+]+:\/\//i, '').split('/')[0];
  }
}

// ── Build adapter-type-specific extra props ───────────────────────────────────
function buildExtraProps(type: string, props: Record<string, string>): Record<string, string> {
  const t = type.toLowerCase();
  const extra: Record<string, string> = {};

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (props[k] !== undefined && props[k] !== '') extra[k] = props[k];
    }
  };

  if (t === 'http' || t === 'https') {
    pick('httpMethod', 'authenticationMethod', 'senderAuthType', 'userRole',
         'httpAddressQuery', 'httpRequestTimeout', 'proxyType', 'throwExceptionOnFailure',
         'xsrfProtection', 'maximumBodySize');
  } else if (t === 'soap') {
    pick('wsdlUrl', 'operationName', 'serviceInterfaceName', 'authenticationMethod',
         'httpMethod', 'proxyType');
  } else if (t === 'sftp') {
    pick('directory', 'fileName', 'port', 'timeout', 'proxyType', 'authenticationType',
         'fileNameAfterProcessing', 'sortBy');
  } else if (t === 'mail') {
    pick('from', 'to', 'cc', 'subject', 'smtpHost', 'smtpPort', 'imapHost',
         'folder', 'authenticationType', 'timeout');
  } else if (t === 'advancedeventmesh' || t === 'aem') {
    pick('endpointType', 'destinationName', 'messageVpn', 'deliveryMode',
         'messageType', 'authenticationType', 'accessTokenFetchIntervalInSecs',
         'replyTimeout', 'dmqEligible');
  } else if (t === 'odata' || t === 'odatav4') {
    pick('resourcePath', 'operationType', 'queryOptions', 'authenticationMethod');
  } else if (t === 'processdirect') {
    pick('address');
  }

  return extra;
}

// ── Parse adapter configs from BPMN2 XML ─────────────────────────────────────
export function parseAdapters(xml: string): AdapterConfig[] {
  const adapters: AdapterConfig[] = [];

  // Extract every <bpmn2:messageFlow ...> ... </bpmn2:messageFlow> block
  const flowRe = /<bpmn2:messageFlow([^>]*)>([\s\S]*?)<\/bpmn2:messageFlow>/g;
  let match: RegExpExecArray | null;

  while ((match = flowRe.exec(xml)) !== null) {
    const attrStr = match[1];   // e.g. id="MessageFlow_11" name="HTTP" sourceRef="..." targetRef="..."
    const body    = match[2];

    const props = extractProps(body);

    // Skip if no ComponentType — not an adapter channel
    const adapterType = (props['ComponentType'] ?? '').trim();
    if (!adapterType) continue;

    // Direction
    const dirRaw = (props['direction'] ?? '').toLowerCase();
    const direction: 'sender' | 'receiver' = dirRaw === 'sender' ? 'sender' : 'receiver';

    // Channel name — prefer Name property, fallback to messageFlow name attribute
    const nameAttrMatch = /\bname="([^"]*)"/.exec(attrStr);
    const channelName = props['Name'] || (nameAttrMatch?.[1] ?? adapterType);

    // Host — depends on adapter type
    let host = '';
    let address = '';
    const at = adapterType.toLowerCase();

    if (at === 'http') {
      // Receiver HTTP: full URL in httpAddressWithoutQuery
      const fullUrl = props['httpAddressWithoutQuery'] ?? '';
      host    = hostFromUrl(fullUrl);
      address = fullUrl;
    } else if (at === 'https') {
      if (direction === 'sender') {
        // Sender HTTPS: inbound path in urlPath, host is this CPI tenant
        address = props['urlPath'] ?? '';
        host    = '(this CPI tenant)';
      } else {
        const fullUrl = props['httpAddressWithoutQuery'] ?? '';
        host    = hostFromUrl(fullUrl);
        address = fullUrl;
      }
    } else if (at === 'soap') {
      const fullUrl = props['wsdlUrl'] ?? props['httpAddressWithoutQuery'] ?? '';
      host    = hostFromUrl(fullUrl);
      address = fullUrl;
    } else if (at === 'sftp') {
      host    = props['host'] ?? props['hostName'] ?? '';
      address = props['directory'] ?? '';
    } else if (at === 'mail') {
      host    = props['smtpHost'] ?? props['imapHost'] ?? props['popHost'] ?? '';
      address = props['folder'] ?? '';
    } else if (at === 'advancedeventmesh' || at === 'aem') {
      // host field contains the full broker URL e.g. tcps://<YOUR-AEM-HOST>:55443
      host    = hostFromUrl(props['host'] ?? '');
      address = props['destinationName'] ?? '';
    } else if (at === 'processdirect') {
      address = props['address'] ?? '';
    } else {
      // Generic fallback
      host    = props['host'] ?? props['hostName'] ?? hostFromUrl(props['Url'] ?? props['url'] ?? '');
      address = props['address'] ?? props['urlPath'] ?? '';
    }

    // Credential — check all common aliases in priority order
    const credentialName =
      props['credentialName'] ||
      props['privateKeyAlias'] ||
      props['keyStoreAlias'] ||
      props['oauth2ClientCredentialsCredentialName'] ||
      props['oauth2AuthorizationCodeCredentialName'] ||
      '';

    // Protocol
    const protocol = props['TransportProtocol'] ?? props['scheme'] ?? '';

    // Port — explicit or derived from host/URL
    const port = props['port'] ?? props['Port'] ?? '';

    adapters.push({
      direction,
      adapterType,
      channelName,
      host,
      address,
      credentialName,
      protocol,
      port,
      extraProps: buildExtraProps(adapterType, props),
    });
  }

  return adapters;
}

// ── Format adapters as a readable summary string ──────────────────────────────
export function summariseAdapters(adapters: AdapterConfig[]): string {
  if (adapters.length === 0) return 'No adapters detected';
  return adapters
    .map((a) => `${a.adapterType}(${a.direction})`)
    .join(', ');
}
