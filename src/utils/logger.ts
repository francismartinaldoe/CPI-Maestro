// src/utils/logger.ts — Structured logger with coloured console output

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const COLOURS: Record<Level, string> = {
  debug: '\x1b[90m',  // grey
  info:  '\x1b[36m',  // cyan
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';

class Logger {
  private minLevel: Level;

  constructor() {
    const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
    this.minLevel = LEVELS[raw] !== undefined ? raw : 'info';
  }

  private log(level: Level, msg: string): void {
    if (LEVELS[level] < LEVELS[this.minLevel]) return;
    const ts = new Date().toISOString().slice(11, 23);
    process.stderr.write(`${COLOURS[level]}[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}${RESET}\n`);
  }

  debug(msg: string): void { this.log('debug', msg); }
  info(msg: string):  void { this.log('info',  msg); }
  warn(msg: string):  void { this.log('warn',  msg); }
  error(msg: string): void { this.log('error', msg); }
}

export const logger = new Logger();
