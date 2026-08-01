import { useEffect, useRef } from "react";

import { clockTime, metaFor } from "../lib/agents.js";

/**
 * The demo's wow moment: agents arguing in real time. Auto-scrolls to the
 * newest message, but only while the viewer is already at the bottom — so
 * scrolling back to re-read an argument mid-demo doesn't get yanked away.
 */
export function DeliberationFeed({ messages, round }) {
  const scrollerRef = useRef(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <section className="panel panel--feed">
      <header className="panel__head">
        <h2>Live deliberation</h2>
        {round > 0 && <span className="pill">Round {round} of 5</span>}
      </header>

      <div className="feed" ref={scrollerRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <p className="empty">Waiting for the first agent to speak…</p>
        )}

        {messages.map((m) => {
          const meta = metaFor(m.agent);
          return (
            <article key={m.key} className="msg" style={{ "--agent": meta.color }}>
              <div className="msg__who">
                <span className="msg__glyph" aria-hidden="true">{meta.glyph}</span>
                <span className="msg__name">{meta.label}</span>
                <time className="msg__time">{clockTime(m.timestamp)}</time>
              </div>
              <p className="msg__body">{m.message}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
