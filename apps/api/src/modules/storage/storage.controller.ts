import { Controller, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { StorageService } from './storage.service'

// We avoid depending on @types/multer; this is the subset we use.
interface UploadedFileLike {
  buffer: Buffer
  mimetype: string
  originalname: string
  size: number
}

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(Phase2Guard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file (image/pdf). Business-scoped.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: JwtPayload,
    @Query('folder') folder?: string,
  ) {
    if (!file) {
      throw new AppBadRequestException('A file is required.', 'FILE_REQUIRED')
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new AppBadRequestException('Unsupported file type.', 'UNSUPPORTED_FILE_TYPE')
    }
    // Keep each business's files in their own prefix.
    const scopedFolder = `${user.businessId ?? 'shared'}/${folder ?? 'uploads'}`
    return this.storage.upload({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      folder: scopedFolder,
    })
  }
}
