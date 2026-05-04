/**
 * Probato SDK - HTTP Client
 *
 * Handles all HTTP communication with the Probato API,
 * including auth headers, rate limit parsing, and error handling.
 */

import {
  ProbatoError,
  AuthenticationError,
  RateLimitError,
  InsufficientCreditsError,
  NotFoundError,
  ForbiddenError,
} from "./errors";
import type { RateLimitInfo } from "./types";

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export interface RawResponse<T> {
  data: T;
  status: number;
  rateLimit?: RateLimitInfo;
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      "User-Agent": `probato-sdk/1.0.0`,
      ...config.defaultHeaders,
    };
  }

  async request<T>(options: RequestOptions): Promise<RawResponse<T>> {
    const url = this.buildUrl(options.path, options.params);

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...options.headers,
      Authorization: `Bearer ${this.apiKey}`,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const rateLimit = this.parseRateLimitHeaders(response);

      // Handle error responses
      if (!response.ok) {
        await this.handleError(response, rateLimit);
      }

      const json = await response.json();
      return {
        data: json.data ?? json,
        status: response.status,
        rateLimit,
      };
    } catch (error) {
      if (error instanceof ProbatoError) throw error;

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ProbatoError("Request timed out", 408, "TIMEOUT");
      }

      throw new ProbatoError(
        error instanceof Error ? error.message : "Unknown error",
        0,
        "NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private parseRateLimitHeaders(response: Response): RateLimitInfo | undefined {
    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const resetAt = response.headers.get("X-RateLimit-Reset");

    if (limit && remaining && resetAt) {
      return {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        resetAt: parseInt(resetAt),
      };
    }

    return undefined;
  }

  private async handleError(
    response: Response,
    rateLimit?: RateLimitInfo
  ): Promise<never> {
    let body: { error?: string; status?: number } = {};
    try {
      body = await response.json();
    } catch {
      // Non-JSON response
    }

    const message = body.error ?? `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);
      case 402:
        throw new InsufficientCreditsError(0, 0);
      case 403:
        throw new ForbiddenError(message);
      case 404:
        throw new NotFoundError(message);
      case 429:
        throw new RateLimitError(
          message,
          parseInt(response.headers.get("Retry-After") ?? "60"),
          rateLimit?.limit ?? 0,
          rateLimit?.remaining ?? 0,
          rateLimit?.resetAt ?? 0
        );
      default:
        throw new ProbatoError(message, response.status);
    }
  }
}
