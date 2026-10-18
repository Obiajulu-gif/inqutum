import { Router, Request, Response } from 'express';
import { exportMemorySnapshot } from '../services/cutover.service';
import memoryStorage from '../storage/memory-storage';

/**
 * Admin-only snapshot dump for the in-memory MVP (issue #15).
 * Protected by CUTOVER_EXPORT_TOKEN — never expose this on a public demo
 * without the token. Pay links stay readable during drain mode.
 */
export function createCutoverExportRouter() {
  const router = Router();

  router.get('/admin/cutover-export', (req: Request, res: Response) => {
    const expected = process.env.CUTOVER_EXPORT_TOKEN;
    if (!expected) {
      return res.status(503).json({
        success: false,
        code: 'CUTOVER_EXPORT_DISABLED',
        error: 'Set CUTOVER_EXPORT_TOKEN to enable MVP snapshot export.',
      });
    }

    // Keep the credential out of URLs, which are commonly retained in proxy
    // access logs and browser history.
    const provided =
      typeof req.headers['x-cutover-token'] === 'string'
        ? req.headers['x-cutover-token']
        : '';

    if (provided !== expected) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Invalid cutover export token.',
      });
    }

    const snapshot = exportMemorySnapshot(memoryStorage);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cutover-snapshot-${snapshot.exportedAt.replace(/[:.]/g, '-')}.json"`
    );
    return res.status(200).json({ success: true, data: snapshot });
  });

  return router;
}
