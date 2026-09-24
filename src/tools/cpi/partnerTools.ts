// src/tools/cpi/partnerTools.ts — Integration Detective partner directory tools

import type Anthropic from '@anthropic-ai/sdk';

export const PARTNER_TOOLS: Anthropic.Tool[] = [
  { name: 'list_partners',              description: 'All trading partners in the partner directory.',                          input_schema: { type: 'object' as const, properties: {} } },
  {
    name: 'get_partner',
    description: 'Details for a specific partner by ID.',
    input_schema: { type: 'object' as const, properties: { pid: { type: 'string' } }, required: ['pid'] },
  },
  {
    name: 'list_partner_string_params',
    description: 'Text config parameters (endpoint URLs, format codes) for a partner.',
    input_schema: { type: 'object' as const, properties: { pid: { type: 'string' } }, required: ['pid'] },
  },
  {
    name: 'list_partner_binary_params',
    description: 'File config parameters (XSLT stylesheets, certificates) for a partner.',
    input_schema: { type: 'object' as const, properties: { pid: { type: 'string' } }, required: ['pid'] },
  },
  {
    name: 'list_alternative_partners',
    description: 'Alternative partner IDs such as DUNS and GLN numbers.',
    input_schema: { type: 'object' as const, properties: { pid: { type: 'string' } } },
  },
  {
    name: 'list_authorized_users',
    description: 'Users authorized to send messages on behalf of a partner.',
    input_schema: { type: 'object' as const, properties: { pid: { type: 'string' } } },
  },
];
