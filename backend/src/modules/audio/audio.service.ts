import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AudioService {
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
  ) {}

  async listAudioFiles() {
    const rows = await this.databaseService.many<any>(
      `
        SELECT
          id,
          original_filename,
          storage_key,
          size_bytes,
          created_at,
          metadata
        FROM audio_assets
        WHERE organization_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `,
      [this.appContextService.getOrganizationId()],
    );

    return rows.map((row) => ({
      fileId: row.id,
      filename: row.original_filename || row.storage_key,
      size: row.size_bytes ? Number(row.size_bytes) : 0,
      created: row.created_at,
      asteriskPath:
        row.metadata?.asteriskPath ||
        `${this.configService.get<string>('ASTERISK_AUDIO_PREFIX', '/srv/var/lib/asterisk/sounds/custom_campaigns')}/${basename(row.storage_key, extname(row.storage_key))}`,
    }));
  }

  async uploadAudio(file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    const soundsDir = this.getSoundsDir();
    const fileId = randomUUID();
    const sourceExt = extname(file.originalname || '').toLowerCase();
    const destination = join(soundsDir, `${fileId}${sourceExt || '.wav'}`);

    renameSync(file.path, destination);

    const finalFileName = this.tryConvertToWav(fileId, destination);
    const finalPath = join(soundsDir, finalFileName);
    const fileStats = statSync(finalPath);
    const asset = await this.insertAudioAsset({
      id: fileId,
      fileName: finalFileName,
      originalName: file.originalname || finalFileName,
      sizeBytes: fileStats.size,
      mimeType: this.mimeTypeForExtension(extname(finalFileName)),
      kind: 'upload',
    });

    return asset;
  }

  async generateTts(payload: { text: string; lang?: string }) {
    if (!payload.text) {
      throw new Error('text required');
    }

    const soundsDir = this.getSoundsDir();
    const fileId = randomUUID();
    const mp3Path = join(soundsDir, `${fileId}.mp3`);
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(payload.text)}&tl=${encodeURIComponent(payload.lang || 'en')}&client=tw-ob&ttsspeed=0.9`;

    const response = await fetch(ttsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CyberX AutoDialer/2.0)' },
    });

    if (!response.ok) {
      throw new Error(`TTS fetch failed: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(mp3Path, buffer);

    const finalFileName = this.tryConvertToWav(fileId, mp3Path);
    const finalPath = join(soundsDir, finalFileName);
    const fileStats = statSync(finalPath);
    const asset = await this.insertAudioAsset({
      id: fileId,
      fileName: finalFileName,
      originalName: finalFileName,
      sizeBytes: fileStats.size,
      mimeType: this.mimeTypeForExtension(extname(finalFileName)),
      kind: 'tts',
      ttsText: payload.text,
      languageCode: payload.lang || 'en',
    });

    return asset;
  }

  async getAudioPlaybackFile(fileId: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT id, storage_key
        FROM audio_assets
        WHERE organization_id = $1
          AND id = $2
          AND deleted_at IS NULL
      `,
      [this.appContextService.getOrganizationId(), fileId],
    );

    if (!row) {
      throw new NotFoundException('Audio file not found');
    }

    const absolutePath = join(this.getSoundsDir(), row.storage_key);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Audio file not found on disk');
    }

    return {
      absolutePath,
      contentType: this.mimeTypeForExtension(extname(row.storage_key)),
    };
  }

  async deleteAudio(fileId: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT id, storage_key
        FROM audio_assets
        WHERE organization_id = $1
          AND id = $2
      `,
      [this.appContextService.getOrganizationId(), fileId],
    );

    if (!row) {
      return { deleted: false };
    }

    const absolutePath = join(this.getSoundsDir(), row.storage_key);
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }

    await this.databaseService.query(
      `
        DELETE FROM audio_assets
        WHERE organization_id = $1
          AND id = $2
      `,
      [this.appContextService.getOrganizationId(), fileId],
    );

    return { deleted: true };
  }

  async syncLocalAudioMetadata() {
    const soundsDir = this.getSoundsDir();
    const files = readdirSync(soundsDir).filter((name) => /\.(wav|mp3|gsm|ogg)$/i.test(name));

    for (const fileName of files) {
      const existing = await this.databaseService.one<any>(
        `
          SELECT id
          FROM audio_assets
          WHERE organization_id = $1
            AND storage_key = $2
            AND deleted_at IS NULL
        `,
        [this.appContextService.getOrganizationId(), fileName],
      );

      if (existing) {
        continue;
      }

      const stats = statSync(join(soundsDir, fileName));
      await this.insertAudioAsset({
        id: randomUUID(),
        fileName,
        originalName: fileName,
        sizeBytes: stats.size,
        mimeType: this.mimeTypeForExtension(extname(fileName)),
        kind: 'upload',
      });
    }
  }

  private async insertAudioAsset(input: {
    id: string;
    fileName: string;
    originalName: string;
    sizeBytes: number;
    mimeType: string;
    kind: string;
    ttsText?: string;
    languageCode?: string;
  }) {
    const asteriskBase = basename(input.fileName, extname(input.fileName));
    const result = await this.databaseService.one<any>(
      `
        INSERT INTO audio_assets (
          id,
          organization_id,
          created_by_user_id,
          kind,
          storage_provider,
          storage_key,
          mime_type,
          original_filename,
          size_bytes,
          language_code,
          tts_text,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, 'local', $5, $6, $7, $8, $9, $10, $11::jsonb
        )
        RETURNING id
      `,
      [
        input.id,
        this.appContextService.getOrganizationId(),
        this.appContextService.getBootstrapUserId(),
        input.kind,
        input.fileName,
        input.mimeType,
        input.originalName,
        input.sizeBytes,
        input.languageCode || null,
        input.ttsText || null,
        JSON.stringify({
          asteriskPath: `${this.configService.get<string>('ASTERISK_AUDIO_PREFIX', '/srv/var/lib/asterisk/sounds/custom_campaigns')}/${asteriskBase}`,
        }),
      ],
    );

    return {
      fileId: result.id,
      filename: input.fileName,
      originalName: input.originalName,
      asteriskPath: `${this.configService.get<string>('ASTERISK_AUDIO_PREFIX', '/srv/var/lib/asterisk/sounds/custom_campaigns')}/${asteriskBase}`,
    };
  }

  private getSoundsDir() {
    const soundsDir = this.configService.get<string>('ASTERISK_SOUNDS_DIR');
    if (!soundsDir) {
      throw new Error('ASTERISK_SOUNDS_DIR not set');
    }

    if (!existsSync(soundsDir)) {
      mkdirSync(soundsDir, { recursive: true });
    }

    return soundsDir;
  }

  private tryConvertToWav(fileId: string, sourcePath: string) {
    const soundsDir = this.getSoundsDir();
    const wavName = `${fileId}.wav`;
    const wavPath = join(soundsDir, wavName);

    try {
      execFileSync('ffmpeg', ['-y', '-i', sourcePath, '-ar', '8000', '-ac', '1', '-acodec', 'pcm_s16le', wavPath], {
        timeout: 30000,
        stdio: 'ignore',
      });

      if (existsSync(sourcePath) && sourcePath !== wavPath) {
        unlinkSync(sourcePath);
      }
      return wavName;
    } catch {
      return basename(sourcePath);
    }
  }

  private mimeTypeForExtension(extension: string) {
    const ext = extension.toLowerCase();
    if (ext === '.mp3') return 'audio/mpeg';
    if (ext === '.ogg') return 'audio/ogg';
    if (ext === '.gsm') return 'audio/x-gsm';
    return 'audio/wav';
  }
}
