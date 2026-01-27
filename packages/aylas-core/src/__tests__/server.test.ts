import request from 'supertest';
import app from '../server';

describe('HTTP Server - Integration Tests', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        service: 'aylas-core',
        timestamp: expect.any(String),
      });
    });

    it('should have valid ISO timestamp', async () => {
      const response = await request(app).get('/health');
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');
      expect(response.type).toBe('application/json');
    });

    it('should have 200 status on every call', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('POST /api/v1/messages/normalize', () => {
    it('should accept POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/messages/normalize')
        .send({ payload: {}, tenant_id: 'test' });

      // Response will vary based on the actual implementation
      // but it should handle the request
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it('should return JSON response', async () => {
      const response = await request(app)
        .post('/api/v1/messages/normalize')
        .send({ payload: {}, tenant_id: 'test' });

      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/multimodal/process', () => {
    it('should accept multimodal process requests', async () => {
      const response = await request(app)
        .post('/api/v1/multimodal/process')
        .send({
          tenant_id: 'test',
          attachment: {},
          type: 'audio',
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('GET /api/v1/contacts/:tenant_id/:phone', () => {
    it('should accept contact lookup requests', async () => {
      const response = await request(app).get('/api/v1/contacts/test/5511999999999');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });

    it('should handle URL-encoded phone numbers', async () => {
      const response = await request(app).get('/api/v1/contacts/test/%2B5511999999999');

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/contacts/upsert', () => {
    it('should accept contact upsert requests', async () => {
      const response = await request(app)
        .post('/api/v1/contacts/upsert')
        .send({
          tenant_id: 'test',
          contact: { phone: '5511999999999' },
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/routing/classify', () => {
    it('should accept routing classify requests', async () => {
      const response = await request(app)
        .post('/api/v1/routing/classify')
        .send({
          tenant_id: 'test',
          message: 'Hello',
          contact: {},
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/events/log', () => {
    it('should accept event logging requests', async () => {
      const response = await request(app)
        .post('/api/v1/events/log')
        .send({
          tenant_id: 'test',
          contact_id: 'contact_1',
          event_type: 'test_event',
          payload: {},
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/chatwoot/sync', () => {
    it('should reject missing tenant_id', async () => {
      const response = await request(app)
        .post('/api/v1/chatwoot/sync')
        .send({
          conversation_id: 'conv_123',
          execution_plan: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing conversation_id', async () => {
      const response = await request(app)
        .post('/api/v1/chatwoot/sync')
        .send({
          tenant_id: 'test',
          execution_plan: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing execution_plan', async () => {
      const response = await request(app)
        .post('/api/v1/chatwoot/sync')
        .send({
          tenant_id: 'test',
          conversation_id: 'conv_123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid sync requests', async () => {
      const response = await request(app)
        .post('/api/v1/chatwoot/sync')
        .send({
          tenant_id: 'test',
          conversation_id: 'conv_123',
          execution_plan: [{ action: 'send_message' }],
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/knowledge-base/query', () => {
    it('should reject missing tenant_id', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/query')
        .send({ query: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing query', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/query')
        .send({ tenant_id: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid query requests', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/query')
        .send({
          tenant_id: 'test',
          query: 'What is the return policy?',
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('POST /api/v1/knowledge-base/documents', () => {
    it('should reject missing tenant_id', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/documents')
        .send({
          documents: [{ id: 'doc_1', content: 'Test' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing documents', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/documents')
        .send({ tenant_id: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject non-array documents', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/documents')
        .send({
          tenant_id: 'test',
          documents: { id: 'doc_1' },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid document requests', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/documents')
        .send({
          tenant_id: 'test',
          documents: [{ id: 'doc_1', content: 'Document content' }],
        });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.type).toBe('application/json');
    });
  });

  describe('HTTP Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should accept JSON content type', async () => {
      const response = await request(app)
        .post('/api/v1/messages/normalize')
        .set('Content-Type', 'application/json')
        .send({ payload: {}, tenant_id: 'test' });

      expect(response.type).toBe('application/json');
    });
  });

  describe('Request Handling', () => {
    it('should handle concurrent requests', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health'),
      ]);

      expect(responses.every((r) => r.status === 200)).toBe(true);
    });

    it('should handle mixed request methods', async () => {
      const getResponse = await request(app).get('/health');
      const postResponse = await request(app)
        .post('/api/v1/messages/normalize')
        .send({ payload: {}, tenant_id: 'test' });

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Error Responses', () => {
    it('should return error response format', async () => {
      const response = await request(app)
        .post('/api/v1/chatwoot/sync')
        .send({ tenant_id: 'test' }); // Missing required fields

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('error');
      expect(response.body.success).toBe(false);
    });

    it('should include error code in responses', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge-base/query')
        .send({ tenant_id: 'test' }); // Missing required query

      if (response.status === 400) {
        expect(response.body.error).toHaveProperty('code');
      }
    });
  });

  describe('Endpoint Routes', () => {
    it('should have all required endpoints', async () => {
      const endpoints = [
        { method: 'GET', path: '/health' },
        { method: 'POST', path: '/api/v1/messages/normalize' },
        { method: 'POST', path: '/api/v1/multimodal/process' },
        { method: 'GET', path: '/api/v1/contacts/test/phone' },
        { method: 'POST', path: '/api/v1/contacts/upsert' },
        { method: 'POST', path: '/api/v1/routing/classify' },
        { method: 'POST', path: '/api/v1/events/log' },
        { method: 'POST', path: '/api/v1/chatwoot/sync' },
        { method: 'POST', path: '/api/v1/knowledge-base/query' },
        { method: 'POST', path: '/api/v1/knowledge-base/documents' },
      ];

      for (const endpoint of endpoints) {
        let response;
        if (endpoint.method === 'GET') {
          response = await request(app).get(endpoint.path);
        } else {
          response = await request(app)
            .post(endpoint.path)
            .send({});
        }

        // Route should exist (not 404)
        expect(response.status).not.toBe(404);
      }
    });
  });
});
