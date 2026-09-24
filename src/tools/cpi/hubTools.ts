// src/tools/cpi/hubTools.ts — Integration Detective SAP Business Accelerator Hub tools

import type Anthropic from '@anthropic-ai/sdk';

export const HUB_TOOLS: Anthropic.Tool[] = [
  {
    name: 'hub_search_packages',
    description: 'Search SAP Business Accelerator Hub for integration packages.',
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' }, top: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'hub_get_package',
    description: 'Full details for a specific SAP Hub package (name, vendor, version, categories).',
    input_schema: { type: 'object' as const, properties: { package_id: { type: 'string' } }, required: ['package_id'] },
  },
  {
    name: 'hub_list_package_iflows',
    description: 'All iFlows inside a SAP Hub package.',
    input_schema: { type: 'object' as const, properties: { package_id: { type: 'string' } }, required: ['package_id'] },
  },
  {
    name: 'hub_search_iflows',
    description: 'Search individual iFlows across all SAP Hub packages.',
    input_schema: { type: 'object' as const, properties: { query: { type: 'string' }, top: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'hub_packages_by_product',
    description: 'SAP Hub packages filtered by SAP product name (e.g. CPQ, S/4HANA, BRIM).',
    input_schema: { type: 'object' as const, properties: { product: { type: 'string' }, top: { type: 'number' } }, required: ['product'] },
  },
];
