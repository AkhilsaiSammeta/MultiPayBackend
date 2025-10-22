import { env } from './config/env.js';
import { app } from './app.js';
import { logger } from './config/logger.js';

const port = env.PORT;

const server = app.listen(port, () => {
  logger.info({ port }, 'Universal Pay backend running');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason: unknown) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
