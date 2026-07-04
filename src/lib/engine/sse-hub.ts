/**
 * Hub SSE : registre des connexions clientes et fan-out des événements.
 * ≤5 utilisateurs → une dizaine de connexions longues, trivial en mémoire.
 *
 * Les quotes sont filtrées par client selon son set de symboles autorisés
 * (positions ∪ alertes ∪ watchlists de l'utilisateur) — le cache étant
 * global au process, on ne diffuse à chacun que ce qui le concerne.
 */

import type { Quote } from "@/lib/marketdata/types";

export interface SseClient {
  id: number;
  userId: string;
  symbols: Set<string>;
  send: (event: string, data: unknown) => void;
}

class SseHub {
  private clients = new Map<number, SseClient>();
  private nextId = 1;

  register(
    userId: string,
    symbols: Set<string>,
    send: SseClient["send"]
  ): number {
    const id = this.nextId++;
    this.clients.set(id, { id, userId, symbols, send });
    return id;
  }

  unregister(id: number): void {
    this.clients.delete(id);
  }

  /** Met à jour le set de symboles des clients connectés d'un utilisateur. */
  setUserSymbols(userId: string, symbols: Set<string>): void {
    for (const client of this.clients.values()) {
      if (client.userId === userId) client.symbols = symbols;
    }
  }

  connectedUserIds(): string[] {
    return [...new Set([...this.clients.values()].map((c) => c.userId))];
  }

  /** Lot de quotes coalescées — filtré par client. */
  broadcastQuotes(quotes: Quote[]): void {
    for (const client of this.clients.values()) {
      const visible = quotes.filter((q) => client.symbols.has(q.symbol));
      if (visible.length === 0) continue;
      try {
        client.send("quotes", visible);
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
