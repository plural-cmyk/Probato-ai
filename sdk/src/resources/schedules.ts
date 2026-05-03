/**
 * Probato SDK - Schedules Resource
 */

import type { HttpClient } from "../http-client";
import type {
  Schedule,
  CreateScheduleParams,
  UpdateScheduleParams,
  PaginatedResponse,
  PaginationParams,
} from "../types";

export class SchedulesResource {
  constructor(private client: HttpClient) {}

  /**
   * List all schedules
   */
  async list(params?: PaginationParams): Promise<PaginatedResponse<Schedule>> {
    const response = await this.client.request<PaginatedResponse<Schedule>>({
      method: "GET",
      path: "/schedules",
      params: params as Record<string, string | number | undefined>,
    });
    return response.data;
  }

  /**
   * Create a new schedule
   */
  async create(params: CreateScheduleParams): Promise<Schedule> {
    const response = await this.client.request<Schedule>({
      method: "POST",
      path: "/schedules",
      body: params,
    });
    return response.data;
  }

  /**
   * Get a schedule by ID
   */
  async get(id: string): Promise<Schedule> {
    const response = await this.client.request<Schedule>({
      method: "GET",
      path: `/schedules/${id}`,
    });
    return response.data;
  }

  /**
   * Update a schedule
   */
  async update(id: string, params: UpdateScheduleParams): Promise<Schedule> {
    const response = await this.client.request<Schedule>({
      method: "PATCH",
      path: `/schedules/${id}`,
      body: params,
    });
    return response.data;
  }

  /**
   * Delete a schedule
   */
  async delete(id: string): Promise<void> {
    await this.client.request({
      method: "DELETE",
      path: `/schedules/${id}`,
    });
  }
}
