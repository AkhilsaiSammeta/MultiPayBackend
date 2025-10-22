import morgan from 'morgan';
import { logger } from '../config/logger.js';

export const requestLogger = morgan('combined', {
  stream: {
  write: (message: string) => {
      logger.info(message.trim());
    }
  }
});
