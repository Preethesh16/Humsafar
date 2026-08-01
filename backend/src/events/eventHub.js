export class EventHub {
  constructor({ historyLimit = 100 } = {}) {
    this.historyLimit = historyLimit;
    this.nextId = 1;
    this.history = [];
    this.clients = new Set();
  }

  publish(event) {
    const entry = { id: this.nextId++, event };
    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }

    const frame = serialize(entry);
    for (const client of this.clients) {
      client.write(frame);
    }

    return entry.id;
  }

  connect(request, response) {
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    response.write("retry: 3000\n\n");

    const lastEventId = Number(request.get("last-event-id") ?? 0);
    if (Number.isInteger(lastEventId) && lastEventId >= 0) {
      for (const entry of this.history) {
        if (entry.id > lastEventId) response.write(serialize(entry));
      }
    }

    this.clients.add(response);
    request.on("close", () => this.clients.delete(response));
  }

  snapshot() {
    return this.history.map(({ id, event }) => ({ id, event }));
  }
}

function serialize({ id, event }) {
  return `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`;
}
