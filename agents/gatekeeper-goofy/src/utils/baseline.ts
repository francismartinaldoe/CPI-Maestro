// utils/baseline.ts  –  save/load baseline snapshots for config-parity check
import * as fs from 'fs';
import * as path from 'path';
import { BaselineSnapshot, Environment } from '../types';
import logger from './logger';

export function loadBaseline(
  baselineDir: string,
  iflowId: string,
  env: Environment
): BaselineSnapshot | null {
  const file = path.join(baselineDir, `${iflowId}_${env}.json`);
  if (!fs.existsSync(file)) {
    logger.warn(`No baseline found at ${file} – config-parity check will be skipped`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as BaselineSnapshot;
  } catch (err) {
    logger.error(`Failed to parse baseline: ${err}`);
    return null;
  }
}

export function saveBaseline(baselineDir: string, snapshot: BaselineSnapshot): void {
  if (!fs.existsSync(baselineDir)) fs.mkdirSync(baselineDir, { recursive: true });
  const file = path.join(baselineDir, `${snapshot.iflowId}_${snapshot.environment}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf-8');
  logger.info(`Baseline saved: ${file}`);
}
