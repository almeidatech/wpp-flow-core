import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from './utils/logger';
import { AylasError, ErrorCode } from './utils/errors';
import { TenantConfigStore } from './config/tenant';

import { MessageNormalizer } from './modules/m1-normalizer/normalizer';
import { MultimodalProcessor } from './modules/m2-multimodal/processor';
import { ContactManager } from './modules/m3-contact/manager';
import { AgentRouter } from './modules/m4-router/router';
import { EventLogger } from './modules/m5-logger/logger';
import { ChatwootAdapter } from './modules/m6-chatwoot/adapter';
import { KnowledgeBase } from './modules/m7-knowledge-base/knowledge-base';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const configStore = new TenantConfigStore();
const normalizer = new MessageNormalizer();
const multimodal = new MultimodalProcessor(configStore);
const contactMgr = new ContactManager(configStore);
const router = new AgentRouter(configStore);
const logger_svc = new EventLogger(configStore);
const chatwootAdapter = new ChatwootAdapter(configStore);
const knowledgeBase = new KnowledgeBase(configStore);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof AylasError) {
    res.status(400).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    },
  });
});

// M1: Normalize message
app.post('/api/v1/messages/normalize', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { payload, tenant_id } = req.body;
    const normalized = normalizer.normalize(payload, tenant_id || 'default');
    res.json({ success: true, data: normalized });
  } catch (err) {
    next(err);
  }
});

// M2: Process multimodal
app.post('/api/v1/multimodal/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, attachment, type } = req.body;
    const extracted = await multimodal.process({ tenant_id, attachment, type });
    res.json({ success: true, data: extracted });
  } catch (err) {
    next(err);
  }
});

// M3: Contact lookup
app.get('/api/v1/contacts/:tenant_id/:phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant_id = String(req.params.tenant_id);
    const phone = String(req.params.phone);
    const contact = await contactMgr.find({ tenant_id, phone });
    res.json({ success: true, data: contact });
  } catch (err) {
    next(err);
  }
});

// M3: Upsert contact
app.post('/api/v1/contacts/upsert', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, contact } = req.body;
    const result = await contactMgr.upsert(tenant_id, contact);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// M4: Route message
app.post('/api/v1/routing/classify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, message, contact, conversation_history } = req.body;
    const decision = await router.classify({
      tenant_id,
      message,
      contact,
      conversation_history,
    });
    res.json({ success: true, data: decision });
  } catch (err) {
    next(err);
  }
});

// M5: Log event
app.post('/api/v1/events/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, contact_id, event_type, payload } = req.body;
    const result = await logger_svc.log({
      tenant_id,
      contact_id,
      event_type,
      payload,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// M6: Sync execution plan to Chatwoot
app.post('/api/v1/chatwoot/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, conversation_id, execution_plan } = req.body;

    if (!tenant_id || !conversation_id || !execution_plan) {
      throw new AylasError(
        ErrorCode.MISSING_FIELD,
        'Missing required fields: tenant_id, conversation_id, or execution_plan'
      );
    }

    const result = await chatwootAdapter.sync({
      tenant_id,
      conversation_id,
      execution_plan,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// M7: Query knowledge base
app.post('/api/v1/knowledge-base/query', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, query, context, top_k, domain } = req.body;

    if (!tenant_id || !query) {
      throw new AylasError(
        ErrorCode.MISSING_FIELD,
        'Missing required fields: tenant_id or query'
      );
    }

    const result = await knowledgeBase.query({
      tenant_id,
      query,
      context,
      top_k,
      domain,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// M7: Add documents to knowledge base
app.post('/api/v1/knowledge-base/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, documents } = req.body;

    if (!tenant_id || !documents || !Array.isArray(documents)) {
      throw new AylasError(
        ErrorCode.MISSING_FIELD,
        'Missing required fields: tenant_id or documents (array)'
      );
    }

    await knowledgeBase.addDocuments(tenant_id, documents);

    const stats = knowledgeBase.getStats(tenant_id);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'aylas-core', timestamp: new Date().toISOString() });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, { service: 'aylas-core' });
  });
}

export default app;
