import axios, { AxiosInstance } from 'axios';
import { AylasError, ErrorCode } from '../../utils/errors';
import { retry } from '../../utils/retry';

export interface BaserowRow {
  id: number;
  [key: string]: unknown;
}

export class BaserowClient {
  private client: AxiosInstance;

  constructor(apiUrl: string, apiToken: string) {
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async findRow(tableId: number, filters: Record<string, unknown>): Promise<BaserowRow | null> {
    try {
      return await retry(async () => {
        const filterParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          filterParams.append(`filter__${key}__equal`, String(value));
        });

        const response = await this.client.get<{ results: BaserowRow[] }>(
          `/api/database/rows/table/${tableId}/?${filterParams.toString()}`
        );

        return response.data.results[0] || null;
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.BASEROW_API_FAILED,
        'Failed to find Baserow row',
        { tableId, filters, error: String(error) }
      );
    }
  }

  async createRow(tableId: number, data: Record<string, unknown>): Promise<BaserowRow> {
    try {
      return await retry(async () => {
        const response = await this.client.post<BaserowRow>(
          `/api/database/rows/table/${tableId}/`,
          data
        );
        return response.data;
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.BASEROW_API_FAILED,
        'Failed to create Baserow row',
        { tableId, error: String(error) }
      );
    }
  }

  async updateRow(tableId: number, rowId: number, data: Record<string, unknown>): Promise<BaserowRow> {
    try {
      return await retry(async () => {
        const response = await this.client.patch<BaserowRow>(
          `/api/database/rows/table/${tableId}/${rowId}/`,
          data
        );
        return response.data;
      });
    } catch (error) {
      throw new AylasError(
        ErrorCode.BASEROW_API_FAILED,
        'Failed to update Baserow row',
        { tableId, rowId, error: String(error) }
      );
    }
  }
}
