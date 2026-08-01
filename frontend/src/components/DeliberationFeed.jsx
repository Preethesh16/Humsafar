import { useEffect, useRef } from "react";

import { clockTime, metaFor } from "../lib/agents.js";
import { AGENT_ICON, IconScale } from "../lib/icons.jsx";

/**
 * The demo's wow moment: agents arguing in real time. Auto-scrolls to the
 * newest message, but only while the viewer is already at the bottom — so
 * scrolling back to re-read an argument mid-demo doesn't get yanked away.
 *
 * Round dividers are inserted purely from the `round` already carried on each
 * message by the reducer; nothing new is computed or fetched here.
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
    <section className="panel">
      <header className="panel-head">
        <div className="panel-title">
          <span className={`live-dot ${messages.length > 0 ? "running" : ""}`} />
          Deliberation room
        </div>
        <span className="run-id">{round > 0 ? `Round ${round} of 5` : "standing by"}</span>
      </header>

      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-seal">
            <IconScale />
          </div>
          <h3>The room is quiet</h3>
          <p>
            Four specialists will argue over one finite pot here. The mediator closes
            the debate the moment the split fits the budget without breaking anyone's
            stated floor.
          </p>
        </div>
      ) : (
        <div className="feed" ref={scrollerRef} onScroll={onScroll}>
          {messages.map((m, index) => {
            const meta = metaFor(m.agent);
            const Icon = AGENT_ICON[m.agent] ?? IconScale;
            const isLead = m.agent === "mediator" || m.agent === "orchestrator";
            const newRound = index === 0 || messages[index - 1].round !== m.round;

            return (
              <div key={m.key}>
                {newRound && m.round > 0 && (
                  <div className="phase-divider">Round {m.round}</div>
                )}
                <article
                  className={`event ${isLead ? "is-lead" : ""}`}
                  style={{ "--agent": meta.color, "--agent-soft": meta.soft }}
                >
                  <span className="event-icon">
                    <Icon />
                  </span>
                  <div>
                    <div className="event-top">
                      <span className="event-who">{meta.label}</span>
                      <time className="event-time">{clockTime(m.timestamp)}</time>
                    </div>
                    <p className="event-body">{m.message}</p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
