import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { pool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { parseSpreadsheet } from '../services/emailPersonalization';
import { logger } from '../utils/logger';

const router   = Router();
const upload   = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });

// ─── Tags ─────────────────────────────────────────────────────────────────────

router.get('/tags', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { rows } = await pool.query(
      `SELECT t.*, COUNT(ct.contact_id) AS contact_count
       FROM tags t
       LEFT JOIN contact_tags ct ON ct.tag_id = t.id
       WHERE t.user_id=$1
       GROUP BY t.id ORDER BY t.name ASC`,
      [user.id]
    );
    res.json(rows);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch tags');
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

router.post('/tags', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user          = req.user as any;
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required' });

    const id = uuidv4();
    await pool.query(
      `INSERT INTO tags (id, user_id, name, color) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, name) DO NOTHING`,
      [id, user.id, name.trim(), color||'#6366f1']
    );
    return res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.delete('/tags/:id', isAuthenticated, async (req: Request, res: Response) => {
  const user = req.user as any;
  await pool.query('DELETE FROM tags WHERE id=$1 AND user_id=$2', [req.params.id, user.id]);
  res.json({ success: true });
});

// ─── Contacts ─────────────────────────────────────────────────────────────────

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user   = req.user as any;
    const page   = Math.max(1, parseInt(req.query.page as string)||1);
    const limit  = Math.min(100, parseInt(req.query.limit as string)||50);
    const tagId  = req.query.tag as string;
    const search = (req.query.search as string)||'';

    let query   = `SELECT c.*, COALESCE(json_agg(json_build_object('id',t.id,'name',t.name,'color',t.color))
                     FILTER (WHERE t.id IS NOT NULL),'[]') AS tags
                   FROM contacts c
                   LEFT JOIN contact_tags ct ON ct.contact_id = c.id
                   LEFT JOIN tags t ON t.id = ct.tag_id
                   WHERE c.user_id=$1`;
    const params: any[] = [user.id];

    if (tagId)  { params.push(tagId);            query += ` AND ct.tag_id=$${params.length}`; }
    if (search) { params.push(`%${search}%`);    query += ` AND (c.email ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`; }

    query += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, (page-1)*limit);

    const countQuery   = `SELECT COUNT(DISTINCT c.id) FROM contacts c
                          LEFT JOIN contact_tags ct ON ct.contact_id=c.id
                          WHERE c.user_id=$1${tagId?` AND ct.tag_id=$2`:''}${search?` AND (c.email ILIKE $${tagId?3:2} OR c.first_name ILIKE $${tagId?3:2} OR c.last_name ILIKE $${tagId?3:2})`:''}`;
    const countParams  = [user.id, ...(tagId?[tagId]:[]), ...(search?[`%${search}%`]:[])];

    const [dataRes, countRes] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);

    res.json({ data: dataRes.rows, total: parseInt(countRes.rows[0].count), page, limit });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch contacts');
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Bulk import contacts from CSV
router.post('/import', isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    const { emails, data } = parseSpreadsheet(req.file.buffer, req.file.mimetype, req.file.originalname);

    if (emails.length === 0) return res.status(400).json({ error: 'No valid emails in CSV' });

    const tagIds: string[] = req.body.tagIds
      ? (Array.isArray(req.body.tagIds) ? req.body.tagIds : [req.body.tagIds])
      : [];

    let imported = 0;
    let skipped  = 0;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const row   = data[i];

      try {
        const result = await pool.query(
          `INSERT INTO contacts (id, user_id, email, first_name, last_name, custom_fields)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (user_id, email) DO UPDATE
             SET first_name = COALESCE(NULLIF(EXCLUDED.first_name,''), contacts.first_name),
                 last_name  = COALESCE(NULLIF(EXCLUDED.last_name,''),  contacts.last_name),
                 custom_fields = COALESCE(contacts.custom_fields, '{}'::jsonb) || EXCLUDED.custom_fields,
                 updated_at = NOW()
           RETURNING id`,
          [uuidv4(), user.id, email,
           row.first_name||row.name||'', row.last_name||'',
           JSON.stringify({ ...row, email: undefined, first_name: undefined, last_name: undefined, name: undefined })]
        );

        const contactId = result.rows[0].id;

        // Attach tags
        for (const tagId of tagIds) {
          await pool.query(
            `INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [contactId, tagId]
          ).catch(() => {});
        }

        imported++;
      } catch (err: any) {
        logger.warn({ email, error: err.message }, 'Contact import row skipped');
        skipped++;
      }
    }

    logger.info({ userId: user.id, imported, skipped }, 'Contacts imported');
    return res.json({ success: true, imported, skipped });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Import failed');
    return res.status(500).json({ error: 'Import failed' });
  }
});

// Assign/remove tag from contacts
router.post('/tag', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { contactIds, tagId, action } = req.body; // action: 'add' | 'remove'

    if (!Array.isArray(contactIds) || !tagId) return res.status(400).json({ error: 'contactIds and tagId required' });

    // Verify tag belongs to user
    const tagCheck = await pool.query('SELECT id FROM tags WHERE id=$1 AND user_id=$2',[tagId, user.id]);
    if (tagCheck.rows.length === 0) return res.status(404).json({ error: 'Tag not found' });

    if (action === 'remove') {
      await pool.query('DELETE FROM contact_tags WHERE contact_id=ANY($1) AND tag_id=$2', [contactIds, tagId]);
    } else {
      for (const cid of contactIds) {
        await pool.query('INSERT INTO contact_tags (contact_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[cid,tagId]).catch(()=>{});
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Tag operation failed' });
  }
});

// Export contacts as CSV
router.get('/export', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user  = req.user as any;
    const tagId = req.query.tag as string;

    let query  = `SELECT c.email, c.first_name, c.last_name, c.subscribed, c.hard_bounced, c.created_at
                  FROM contacts c ${tagId ? 'JOIN contact_tags ct ON ct.contact_id=c.id' : ''}
                  WHERE c.user_id=$1 ${tagId ? 'AND ct.tag_id=$2' : ''}
                  ORDER BY c.created_at DESC LIMIT 50000`;
    const { rows } = await pool.query(query, tagId ? [user.id, tagId] : [user.id]);

    const header = 'email,first_name,last_name,subscribed,hard_bounced,created_at\n';
    const csv    = rows.map((r: any) =>
      [r.email, r.first_name||'', r.last_name||'', r.subscribed, r.hard_bounced, r.created_at].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${Date.now()}.csv"`);
    res.send(header + csv);
  } catch (err: any) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Delete a contact
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    await pool.query('DELETE FROM contacts WHERE id=$1 AND user_id=$2', [req.params.id, user.id]);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to delete contact');
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
