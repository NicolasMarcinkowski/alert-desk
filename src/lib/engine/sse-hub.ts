/**
 * Hub SSE : registre des connexions clientes et fan-out des événements.
 * ≤5 utilisateurs → une dizaine de connexions longues, trivial en mémoire.
 */

export interface SseClient {
  id: number;
  userId: string;
  send: (event: string, data: unknown) => void;
}

class SseHub {
  private clients = new Map<number, SseClient>();
  private nextId = 1;

  register(userId: string, send: SseClient["send"]): number {
    const id = this.nextId++;
    this.clients.set(id, { id, userId, send });
    return id;
  }

  unregister(id: number): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      try {
        client.send(event, data);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      if (client.userId !== userId) continue;
      try {
        client.send(event, data);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  clientCount(): number {
    return this.clients.size;
  }
}

const globalRef = globalThis as unknown as { __alertDeskSseHub?: SseHub };
export const sseHub = globalRef.__alertDeskSseHub ?? new SseHub();
globalRef.__alertDeskSseHub = sseHub;
