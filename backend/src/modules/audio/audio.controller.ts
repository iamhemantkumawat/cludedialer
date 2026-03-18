import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AudioService } from './audio.service';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  @Get()
  listAudioFiles() {
    return this.audioService.listAudioFiles();
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('audio', {
      dest: '/tmp/autodialer-uploads/',
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadAudio(@UploadedFile() file: Express.Multer.File) {
    return this.audioService.uploadAudio(file);
  }

  @Post('tts')
  generateTts(@Body() body: any) {
    return this.audioService.generateTts(body);
  }

  @Get(':fileId/play')
  async playAudio(@Param('fileId') fileId: string, @Res() response: Response) {
    const file = await this.audioService.getAudioPlaybackFile(fileId);
    response.sendFile(file.absolutePath, {
      headers: {
        'Content-Type': file.contentType,
      },
    });
  }

  @Delete(':fileId')
  deleteAudio(@Param('fileId') fileId: string) {
    return this.audioService.deleteAudio(fileId);
  }
}
