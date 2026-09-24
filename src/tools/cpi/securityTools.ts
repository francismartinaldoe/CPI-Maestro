// src/tools/cpi/securityTools.ts — Integration Detective security and certificate tools

import type Anthropic from '@anthropic-ai/sdk';

export const SECURITY_TOOLS: Anthropic.Tool[] = [
  { name: 'list_keystores',                 description: 'All keystore entries with alias, type, and expiry date.',         input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_credentials',              description: 'Basic auth credential aliases.',                                    input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_oauth_credentials',        description: 'OAuth2 client credential configurations.',                          input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_secure_parameters',        description: 'Encrypted secure parameter entries.',                               input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_ssh_keys',                 description: 'SSH key pairs used for SFTP adapters.',                             input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_certificate_user_mappings',description: 'Certificate-to-user-role mappings.',                               input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_access_policies',          description: 'Role-based access control rules.',                                  input_schema: { type: 'object' as const, properties: {} } },
  { name: 'list_certificate_resources',    description: 'Full X.509 certificate chain details.',                             input_schema: { type: 'object' as const, properties: {} } },
];
