import { useEffect, useReducer, useState } from "react";

import { initialState, reduce } from "../state/sessionReducer.js";
import { startMockStream } from "./mockStream.js";

export const SOURCE = { MOCK: "mock", LIVE: "live" };

/**
 * Connects to Preethesh's SSE stream at `GET /api/events` (INTERFACES.md §2),
 * or replays the mocked demo script when `source` is "mock".
 *
 * The browser's own EventSource handles reconnection and sends `Last-Event-ID`
 * automatically; the backend replays buffered frames after that id, and the
 * reducer drops any frame whose id it has already folded in. That means a
 * mid-demo backend blip re-syncs the dashboard instead of duplicating the feed.
 */
export function useEventStream(source) {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [connection, setConnection] = useState("connecting");

  useEffect(() => {
    if (source === SOURCE.MOCK) {
      setConnection("mock");
      return startMockStream((frame) => dispatch(frame));
    }

    setConnection("connecting");
    const es = new EventSource("/api/events");

    es.onopen = () => setConnection("open");
    es.onmessage = (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        // A malformed frame must not kill the feed mid-demo.
        console.warn("Discarded unparseable SSE frame", message.data);
        return;
      }
      dispatch({ id: Number(message.lastEventId) || null, event });
    };
    // EventSource retries on its own (the backend sends `retry: 3000`), so this
    // only surfaces the state — it must not close the connection.
    es.onerror = () => setConnection("reconnecting");

    return () => es.close();
  }, [source]);

  return { state, connection };
}

/** Reads the initial source from ?source=live|mock, defaulting to the mock. */
export function initialSource() {
  if (typeof window === "undefined") return SOURCE.MOCK;
  const requested = new URLSearchParams(window.location.search).get("source");
  return requested === SOURCE.LIVE ? SOURCE.LIVE : SOURCE.MOCK;
}
