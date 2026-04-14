import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';

const router = new Hono();

// GET /notifications — list notifications for current user
router.get('/', async (c) => {
  const userId = getUserId(c);

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Notifications GET] Error:', error);
    return c.json({ error: 'Failed to fetch notifications' }, 500);
  }

  // Get unread count
  const { count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  return c.json({ notifications: data, unreadCount: count ?? 0 });
});

// PATCH /notifications/:id — mark as read
router.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[Notifications PATCH] Error:', error);
    return c.json({ error: 'Failed to update notification' }, 500);
  }

  return c.json(data);
});

// PATCH /notifications — mark all as read
router.patch('/', async (c) => {
  const userId = getUserId(c);

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.error('[Notifications PATCH all] Error:', error);
    return c.json({ error: 'Failed to mark all as read' }, 500);
  }

  return c.json({ ok: true });
});

export default router;
