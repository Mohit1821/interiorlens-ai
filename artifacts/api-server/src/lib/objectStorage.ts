import { randomUUID } from 'crypto';
import { pool } from '@workspace/db';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    return ['/public'];
  }

  getPrivateObjectDir(): string {
    return '/objects/uploads';
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    return `/api/storage/uploads/put/${objectId}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const match = rawPath.match(/\/api\/storage\/uploads\/put\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `/objects/uploads/${match[1]}`;
    }
    return rawPath;
  }

  async getObjectEntityFile(objectPath: string): Promise<any> {
    const id = objectPath
      .replace(/^\/objects\/uploads\//, '')
      .replace(/^\/objects\//, '')
      .trim();

    const res = await pool.query(
      'SELECT id, file_name, file_type, file_size, file_data FROM uploaded_files WHERE id = $1',
      [id],
    );

    if (res.rows.length === 0) {
      throw new ObjectNotFoundError();
    }

    const row = res.rows[0];
    return {
      getMetadata: async () => [
        {
          contentType: row.file_type,
          size: Number(row.file_size),
          name: row.file_name,
        },
      ],
      download: async () => [row.file_data as Buffer],
      exists: async () => [true],
    };
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    _aclPolicy: any,
  ): Promise<string> {
    return this.normalizeObjectEntityPath(rawPath);
  }

  async canAccessObjectEntity(_opts: any): Promise<boolean> {
    return true;
  }

  async searchPublicObject(_filePath: string): Promise<any> {
    return null;
  }

  async downloadObject(
    file: any,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    const headers: Record<string, string> = {
      'Content-Type': metadata.contentType || 'application/octet-stream',
      'Content-Length': String(metadata.size || buffer.length),
      'Cache-Control': `public, max-age=${cacheTtlSec}`,
    };

    return new Response(buffer, { headers });
  }
}
