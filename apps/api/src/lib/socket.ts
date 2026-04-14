/**
 * Socket.io server instance for the Findr API.
 *
 * Usage: call getOrCreateSocketServer(httpServer) to attach Socket.io
 * to an existing Node HTTP server. The returned io instance can be used
 * anywhere to emit real-time events to authenticated users.
 */

import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { supabase } from '../db';

let io: IOServer | null = null;

/**
 * Attach Socket.io to the given HTTP server (lazily created once).
 * On connect, the client must pass a Supabase auth token via the
 * handshake query param ?token=  The token is verified with
 * supabase.auth.getUser() and the socket joins the room user:${userId}.
 *
 * Returns the configured io instance.
 */
export function getOrCreateSocketServer(httpServer: HttpServer): IOServer {
  if (io) return io;

  io = new IOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', async (socket) => {
    const token =
      (socket.handshake.query.token as string | undefined) ||
      (socket.handshake.auth?.token as string | undefined);

    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data?.user) {
        socket.disconnect(true);
        return;
      }

      const room = `user:${data.user.id}`;
      socket.join(room);
      console.log(`[Socket.io] Connected user ${data.user.id} to room ${room}`);

      socket.on('disconnect', () => {
        console.log(`[Socket.io] Disconnected user ${data.user.id}`);
      });
    } catch (err) {
      console.error('[Socket.io] Auth error during connection:', err);
      socket.disconnect(true);
    }
  });

  return io;
}

/**
 * Return the existing io instance, or null if not yet created.
 */
export function getSocketServer(): IOServer | null {
  return io;
}
