import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'

// ─── Response types ───────────────────────────────────────────────────────────

export interface WahaMessageId {
  id: string
  timestamp: number
}

export interface WahaCheckContactExistsResponse {
  numberExists: boolean
}

// ─── Request types ────────────────────────────────────────────────────────────

export interface WahaSendTextRequest {
  chatId: string
  text: string
  session?: string
}

export interface WahaFilePayload {
  url: string
  mimetype?: string
  filename?: string
}

export interface WahaSendImageRequest {
  chatId: string
  file: WahaFilePayload
  caption?: string
  session?: string
}

export interface WahaSendFileRequest {
  chatId: string
  file: WahaFilePayload
  caption?: string
  session?: string
}

export interface WahaSendVoiceRequest {
  chatId: string
  file: WahaFilePayload
  session?: string
}

export interface WahaSendVideoRequest {
  chatId: string
  file: WahaFilePayload
  caption?: string
  session?: string
}

// ─── Client ──────────────────────────────────────────────────────────────────

@Injectable()
export class WahaHttpClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly session: string

  constructor(private readonly config: ConfigService<AppConfig>) {
    this.baseUrl = (this.config.get('WHATSAPP_BASE_URL', { infer: true }) ?? '').replace(/\/$/, '')
    this.apiKey = this.config.get('WHATSAPP_API_KEY', { infer: true }) ?? ''
    this.session = this.config.get('WHATSAPP_SESSION', { infer: true }) ?? 'default'
  }

  get defaultSession(): string {
    return this.session
  }

  // ─── POST /api/sendText ────────────────────────────────────────────────────

  sendText(body: WahaSendTextRequest): Promise<WahaMessageId> {
    return this.post<WahaMessageId>('/api/sendText', {
      session: this.session,
      ...body,
    })
  }

  // ─── GET /api/contacts/check-exists ──────────────────────────────────────

  checkContactExists(phone: string): Promise<WahaCheckContactExistsResponse> {
    const query = new URLSearchParams({ phone, session: this.session })
    return this.get<WahaCheckContactExistsResponse>(`/api/contacts/check-exists?${query.toString()}`)
  }

  // ─── GET /api/sendText ─────────────────────────────────────────────────────

  sendTextGet(params: WahaSendTextRequest): Promise<WahaMessageId> {
    const query = new URLSearchParams({
      session: params.session ?? this.session,
      chatId: params.chatId,
      text: params.text,
    })
    return this.get<WahaMessageId>(`/api/sendText?${query.toString()}`)
  }

  // ─── POST /api/sendImage ───────────────────────────────────────────────────

  sendImage(body: WahaSendImageRequest): Promise<WahaMessageId> {
    return this.post<WahaMessageId>('/api/sendImage', {
      session: this.session,
      ...body,
    })
  }

  // ─── POST /api/sendFile ────────────────────────────────────────────────────

  sendFile(body: WahaSendFileRequest): Promise<WahaMessageId> {
    return this.post<WahaMessageId>('/api/sendFile', {
      session: this.session,
      ...body,
    })
  }

  // ─── POST /api/sendVoice ───────────────────────────────────────────────────

  sendVoice(body: WahaSendVoiceRequest): Promise<WahaMessageId> {
    return this.post<WahaMessageId>('/api/sendVoice', {
      session: this.session,
      ...body,
    })
  }

  // ─── POST /api/sendVideo ───────────────────────────────────────────────────

  sendVideo(body: WahaSendVideoRequest): Promise<WahaMessageId> {
    return this.post<WahaMessageId>('/api/sendVideo', {
      session: this.session,
      ...body,
    })
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private get defaultHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(body),
    })

    return this.parseResponse<T>(res)
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.defaultHeaders,
    })

    return this.parseResponse<T>(res)
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    const text = await res.text()

    if (!res.ok) {
      throw new Error(`WAHA ${res.status} ${res.statusText}: ${text}`)
    }

    if (!text.trim()) {
      return {} as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`WAHA returned non-JSON response (${res.status}): ${text}`)
    }
  }
}
