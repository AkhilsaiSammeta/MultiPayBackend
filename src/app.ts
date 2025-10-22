import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { paymentsRouter } from './routes/payments.js';
import { webhookRouter } from './routes/webhooks.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(
  express.json({
    verify: (req: Request, _res: Response, buffer: Buffer) => {
      if (req.originalUrl.startsWith('/webhooks')) {
        req.rawBody = Buffer.from(buffer);
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/payments', paymentsRouter);
app.use('/webhooks', webhookRouter);

app.use(errorHandler);

export { app };
