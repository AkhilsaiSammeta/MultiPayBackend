import pino from 'pino';
import { env } from './env.js';

const baseLogger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
});

export const logger = baseLogger;

export const createLogger = (context: string) => baseLogger.child({ context });
