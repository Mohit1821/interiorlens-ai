import express, { Router, type IRouter, type Request, type Response } from 'express';
import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { db, pool, uploadIntentsTable } from '@workspace/db';
import crypto from 'crypto';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB maximum to protect Supabase DB storage
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

/**
 * PUT /storage/uploads/put/:id
 * Receives the raw binary file data and stores it in Supabase uploaded_files table.
 */
router.put(
  '/storage/uploads/put/:id',
  express.raw({ type: '*/*', limit: '6mb' }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const buffer = req.body as Buffer;
      const contentType =
        (req.headers['content-type'] as string) || 'application/octet-stream';

      if (!buffer || buffer.length === 0) {
        res.status(400).json({ error: 'No file data received' });
        return;
      }

      if (buffer.length > MAX_UPLOAD_BYTES) {
        res.status(400).json({ error: 'File exceeds maximum 5 MB limit.' });
        return;
      }

      await pool.query(
        `INSERT INTO uploaded_files (id, file_name, file_type, file_size, file_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET file_data = $5, file_type = $3, file_size = $4`,
        [id, id, contentType, buffer.length, buffer],
      );

      res.status(200).send('OK');
    } catch (err) {
      req.log.error({ err }, 'Error saving uploaded file to Supabase database');
      res.status(500).json({ error: 'Failed to save file' });
    }
  },
);

/**
 * POST /storage/uploads/request-url
 * Returns a direct upload URL on this server which writes directly to Supabase.
 * Allows guest uploads!
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const userId = req.user?.id || 'guest_user';

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const extension = name.split('.').pop()?.toLowerCase();

      if (
        !extension ||
        !ALLOWED_EXTENSIONS.has(extension) ||
        !ALLOWED_UPLOAD_TYPES.has(contentType) ||
        size > MAX_UPLOAD_BYTES ||
        name.includes('/') ||
        name.includes('\\')
      ) {
        res.status(400).json({
          error: 'Please upload only PDF, JPG, PNG, or WEBP quotation files up to 5 MB.',
        });
        return;
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      await db.insert(uploadIntentsTable).values({
        id: `upl-${crypto.randomUUID()}`,
        objectPath,
        ownerId: userId,
        fileName: name,
        fileType: contentType,
        fileSize: size,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/objects/*
 * Serve uploaded files directly from Supabase database.
 */
router.get('/storage/objects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectPath = `/objects/uploads/${id}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const [metadata] = await objectFile.getMetadata();
    const [buffer] = await objectFile.download();

    res.setHeader(
      'Content-Type',
      metadata.contentType || 'application/octet-stream',
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

router.get('/storage/objects/uploads/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectPath = `/objects/uploads/${id}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const [metadata] = await objectFile.getMetadata();
    const [buffer] = await objectFile.download();

    res.setHeader(
      'Content-Type',
      metadata.contentType || 'application/octet-stream',
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
