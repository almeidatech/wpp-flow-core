export type TenantId = string;
export type MessageType = 'text' | 'audio' | 'image' | 'document' | 'video';
export type IntentType = 'sales' | 'support' | 'appointment' | 'general';

export interface BaseMessage {
  tenant_id: TenantId;
  conversation_id: string;
  phone: string;
  timestamp: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export enum ErrorCode {
  VALIDATION_ERROR = 'ERR_VALIDATION',
  INVALID_TENANT = 'ERR_INVALID_TENANT',
  MISSING_FIELD = 'ERR_MISSING_FIELD',
  CHATWOOT_API_FAILED = 'ERR_CHATWOOT_API',
  BASEROW_API_FAILED = 'ERR_BASEROW_API',
  LLM_API_FAILED = 'ERR_LLM_API',
  TRANSCRIPTION_FAILED = 'ERR_TRANSCRIPTION',
  OCR_FAILED = 'ERR_OCR',
  PDF_PARSE_FAILED = 'ERR_PDF_PARSE',
  CONTACT_NOT_FOUND = 'ERR_CONTACT_NOT_FOUND',
  POLICY_EXECUTION_FAILED = 'ERR_POLICY_EXEC',
  INTERNAL_ERROR = 'ERR_INTERNAL',
  TIMEOUT = 'ERR_TIMEOUT',
}

export interface WebhookPayload {
  event: 'message_created' | 'conversation_status_changed';
  body: {
    conversation: { id: number; contact: { phone_number: string } };
    message?: { content: string; content_type: string; attachments?: Attachment[] };
    custom_attributes?: Record<string, unknown>;
  };
}

export interface Attachment {
  id: number;
  file_url: string;
  data_url: string;
  file_type: string;
}

export interface NormalizedMessage extends BaseMessage {
  type: MessageType;
  content: string;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
}

export interface Contact {
  id: number;
  phone: string;
  name: string;
  email?: string;
  custom_fields: Record<string, unknown>;
  created_at: number;
}

export interface RoutingDecision {
  intent: IntentType;
  confidence: number;
  suggested_agent?: string;
  metadata: {
    keywords?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
}

export interface EventLog {
  id: number;
  tenant_id: TenantId;
  contact_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface PolicyAction {
  type: 'send_message' | 'assign_agent' | 'update_contact' | 'trigger_webhook' | 'add_label' | 'update_attributes';
  params: Record<string, unknown>;
}

export interface EventPolicy {
  event_type: string;
  condition?: Record<string, unknown>;
  actions: PolicyAction[];
  priority?: number;
}

export interface TenantConfig {
  id: TenantId;
  name: string;

  chatwoot: {
    account_id: number;
    api_url: string;
    api_token: string;
  };

  baserow: {
    api_url: string;
    api_token: string;
    tables: {
      contacts: number;
      events: number;
      knowledge_base?: number;
    };
  };

  llm: {
    provider: 'openai' | 'anthropic';
    api_key: string;
    model: string;
    temperature: number;
  };

  routing: {
    default_intent: IntentType;
    auto_assign: boolean;
    agent_mapping?: Record<IntentType, number>;
  };

  policies: EventPolicy[];
}
