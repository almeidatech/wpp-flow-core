import { ContactManager, ContactLookupRequest } from '../manager';
import { TenantConfigStore } from '../../../config/tenant';
import { Contact } from '../../../config/types';
import { BaserowClient } from '../baserow-client';

jest.mock('../baserow-client');

const mockConfigStore = {
  get: jest.fn().mockResolvedValue({
    id: 'tenant_123',
    baserow: {
      api_url: 'https://api.baserow.io',
      api_token: 'test-token',
      tables: { contacts: 100, events: 101 },
    },
  }),
} as unknown as TenantConfigStore;

describe('ContactManager', () => {
  let manager: ContactManager;
  let mockClient: jest.Mocked<BaserowClient>;

  beforeEach(() => {
    manager = new ContactManager(mockConfigStore);
    mockClient = new BaserowClient('', '') as jest.Mocked<BaserowClient>;
    jest.clearAllMocks();
  });

  describe('find', () => {
    it('should find existing contact', async () => {
      const mockRow = {
        id: 42,
        phone: '5511999999999',
        name: 'John Doe',
        email: 'john@example.com',
        custom_fields: JSON.stringify({ source: 'whatsapp' }),
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511999999999',
      };

      const result = await manager.find(req);

      expect(result).toMatchObject({
        id: 42,
        phone: '5511999999999',
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(result?.custom_fields).toEqual({ source: 'whatsapp' });
    });

    it('should return null if contact not found', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511999999999',
      };

      const result = await manager.find(req);

      expect(result).toBeNull();
    });

    it('should handle null custom fields', async () => {
      const mockRow = {
        id: 43,
        phone: '5511999999999',
        name: 'Jane Doe',
        custom_fields: null,
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511999999999',
      };

      const result = await manager.find(req);

      expect(result?.custom_fields).toEqual({});
    });
  });

  describe('upsert', () => {
    it('should create new contact', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 44,
        phone: '5511888888888',
        name: 'New Contact',
        email: null,
        custom_fields: '{}',
        created_at: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const contact: Partial<Contact> = {
        phone: '5511888888888',
        name: 'New Contact',
      };

      const result = await manager.upsert('tenant_123', contact);

      expect(result.phone).toBe('5511888888888');
      expect(result.name).toBe('New Contact');
      expect(mockClient.createRow).toHaveBeenCalled();
    });

    it('should update existing contact', async () => {
      const existingRow = {
        id: 45,
        phone: '5511777777777',
        name: 'Old Name',
        email: 'old@example.com',
        custom_fields: '{}',
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(existingRow);
      mockClient.updateRow = jest.fn().mockResolvedValue({
        ...existingRow,
        name: 'Updated Name',
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const contact: Partial<Contact> = {
        phone: '5511777777777',
        name: 'Updated Name',
      };

      const result = await manager.upsert('tenant_123', contact);

      expect(result.name).toBe('Updated Name');
      expect(mockClient.updateRow).toHaveBeenCalled();
    });

    it('should throw error if phone is missing', async () => {
      const contact: Partial<Contact> = {
        name: 'No Phone',
      };

      await expect(manager.upsert('tenant_123', contact)).rejects.toThrow('Phone is required');
    });
  });

  describe('updateFields', () => {
    it('should update custom fields', async () => {
      const existingRow = {
        id: 46,
        phone: '5511666666666',
        name: 'Test User',
        custom_fields: JSON.stringify({ field1: 'value1' }),
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(existingRow);
      mockClient.updateRow = jest.fn().mockResolvedValue(existingRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      await manager.updateFields('tenant_123', 46, { field2: 'value2' });

      expect(mockClient.updateRow).toHaveBeenCalledWith(
        100,
        46,
        expect.objectContaining({
          custom_fields: expect.stringContaining('field1'),
        })
      );
    });

    it('should throw error if contact not found', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      await expect(manager.updateFields('tenant_123', 999, { field: 'value' })).rejects.toThrow(
        'Contact not found'
      );
    });
  });

  describe('parseCustomFields edge cases', () => {
    it('should handle custom_fields as object (not string)', async () => {
      const mockRow = {
        id: 47,
        phone: '5511555555555',
        name: 'Object Fields',
        custom_fields: { field: 'value' }, // Already an object
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511555555555',
      };

      const result = await manager.find(req);

      expect(result?.custom_fields).toEqual({ field: 'value' });
    });

    it('should handle invalid JSON in custom_fields', async () => {
      const mockRow = {
        id: 48,
        phone: '5511444444444',
        name: 'Invalid JSON',
        custom_fields: 'invalid json {{{', // Invalid JSON
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511444444444',
      };

      const result = await manager.find(req);

      expect(result?.custom_fields).toEqual({});
    });

    it('should handle missing phone in row', async () => {
      const mockRow = {
        id: 49,
        name: 'No Phone',
        custom_fields: '{}',
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511333333333',
      };

      const result = await manager.find(req);

      expect(result?.phone).toBe('');
    });

    it('should handle missing name in row', async () => {
      const mockRow = {
        id: 50,
        phone: '5511222222222',
        custom_fields: '{}',
        created_at: 1234567890,
      };

      mockClient.findRow = jest.fn().mockResolvedValue(mockRow);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511222222222',
      };

      const result = await manager.find(req);

      expect(result?.name).toBe('Unknown');
    });
  });

  describe('Client caching', () => {
    it('should reuse client for same tenant', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const req: ContactLookupRequest = {
        tenant_id: 'tenant_123',
        phone: '5511999999999',
      };

      await manager.find(req);
      await manager.find(req);
      await manager.find(req);

      // BaserowClient should only be called once (cached)
      expect(BaserowClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Upsert without name and email', () => {
    it('should use default name when not provided', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 51,
        phone: '5511111111111',
        name: 'Unknown',
        custom_fields: '{}',
        created_at: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const contact: Partial<Contact> = {
        phone: '5511111111111',
      };

      const result = await manager.upsert('tenant_123', contact);

      expect(mockClient.createRow).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          name: 'Unknown',
        })
      );
      expect(result.name).toBe('Unknown');
    });

    it('should handle missing email gracefully', async () => {
      mockClient.findRow = jest.fn().mockResolvedValue(null);
      mockClient.createRow = jest.fn().mockResolvedValue({
        id: 52,
        phone: '5511010101010',
        name: 'No Email',
        email: null,
        custom_fields: '{}',
        created_at: Date.now(),
      });
      (BaserowClient as jest.Mock).mockImplementation(() => mockClient);

      const contact: Partial<Contact> = {
        phone: '5511010101010',
        name: 'No Email',
      };

      const result = await manager.upsert('tenant_123', contact);

      expect(result.email).toBeUndefined();
    });
  });
});
