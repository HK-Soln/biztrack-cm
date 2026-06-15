import type { HttpClient } from '@biztrack/http-client'
import type { UploadFileInput, UploadedFile } from '../../shared/ipc'

type ApiEnvelope<T> = { success?: boolean; data: T }

/**
 * Uploads files to the API storage service (POST /uploads) on behalf of the
 * renderer. Runs in main so the phase2 access token (attached + auto-refreshed by
 * authHttp) never reaches the renderer. The API scopes the key to the business.
 * Online-only: offline, the API call fails and the caller surfaces the error.
 */
export class UploadService {
  constructor(private readonly http: HttpClient) {}

  async upload(input: UploadFileInput): Promise<UploadedFile> {
    const form = new FormData()
    const blob = new Blob([input.bytes], { type: input.contentType || 'application/octet-stream' })
    form.append('file', blob, input.filename || 'upload')

    const query = input.folder ? `?folder=${encodeURIComponent(input.folder)}` : ''
    // FormData is passed through by the http client; fetch sets the multipart boundary.
    const { data } = await this.http.post<ApiEnvelope<UploadedFile>>(`/uploads${query}`, form)
    return data.data
  }
}
