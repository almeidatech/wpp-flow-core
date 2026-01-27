import { Contact, TenantId } from '../../config/types';
import { TenantConfigStore } from '../../config/tenant';
import { logger } from '../../utils/logger';
import { BaserowClient } from './baserow-client';

export interface ContactLookupRequest {
  tenant_id: TenantId;
  phone: string;
}

export class ContactManager {
  private clients: Map<TenantId, BaserowClient> = new Map();

  constructor(private configStore: TenantConfigStore) {}

  private async getClient(tenant_id: TenantId): Promise<BaserowClient> {
    let client = this.clients.get(tenant_id);

    if (!client) {
      const config = await this.configStore.get(tenant_id);
      client = new BaserowClient(config.baserow.api_url, config.baserow.api_token);
      this.clients.set(tenant_id, client);
    }

    return client;
  }

  private async getTableId(tenant_id: TenantId): Promise<number> {
    const config = await this.configStore.get(tenant_id);
    return config.baserow.tables.contacts;
  }

  async find(req: ContactLookupRequest): Promise<Contact | null> {
    const client = await this.getClient(req.tenant_id);
    const tableId = await this.getTableId(req.tenant_id);

    logger.info('Looking up contact', {
      tenant_id: req.tenant_id,
      phone: req.phone,
    });

    const row = await client.findRow(tableId, { phone: req.phone });

    if (!row) {
      logger.info('Contact not found', {
        tenant_id: req.tenant_id,
        phone: req.phone,
      });
      return null;
    }

    return this.mapRowToContact(row);
  }

  async upsert(tenant_id: TenantId, contact: Partial<Contact>): Promise<Contact> {
    const client = await this.getClient(tenant_id);
    const tableId = await this.getTableId(tenant_id);

    if (!contact.phone) {
      throw new Error('Phone is required for contact upsert');
    }

    logger.info('Upserting contact', {
      tenant_id,
      phone: contact.phone,
    });

    const existing = await client.findRow(tableId, { phone: contact.phone });

    if (existing) {
      const updated = await client.updateRow(tableId, existing.id, {
        name: contact.name,
        email: contact.email,
        custom_fields: JSON.stringify(contact.custom_fields || {}),
      });
      return this.mapRowToContact(updated);
    }

    const created = await client.createRow(tableId, {
      phone: contact.phone,
      name: contact.name || 'Unknown',
      email: contact.email || null,
      custom_fields: JSON.stringify(contact.custom_fields || {}),
      created_at: Date.now(),
    });

    return this.mapRowToContact(created);
  }

  async updateFields(
    tenant_id: TenantId,
    contact_id: number,
    fields: Record<string, unknown>
  ): Promise<void> {
    const client = await this.getClient(tenant_id);
    const tableId = await this.getTableId(tenant_id);

    logger.info('Updating contact fields', {
      tenant_id,
      contact_id,
      fields: Object.keys(fields),
    });

    const existing = await client.findRow(tableId, { id: contact_id });

    if (!existing) {
      throw new Error(`Contact not found: ${contact_id}`);
    }

    const currentCustomFields = this.parseCustomFields(existing.custom_fields);
    const mergedCustomFields = { ...currentCustomFields, ...fields };

    await client.updateRow(tableId, contact_id, {
      custom_fields: JSON.stringify(mergedCustomFields),
    });
  }

  private mapRowToContact(row: Record<string, unknown>): Contact {
    return {
      id: row.id as number,
      phone: String(row.phone || ''),
      name: String(row.name || 'Unknown'),
      email: row.email ? String(row.email) : undefined,
      custom_fields: this.parseCustomFields(row.custom_fields),
      created_at: Number(row.created_at || Date.now()),
    };
  }

  private parseCustomFields(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try {
      return JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
