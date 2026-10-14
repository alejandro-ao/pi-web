"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const TOP_GAP = 8;

interface Preview { text: string; left: number; width: number }

/** An overlay, not a sticky copy in the transcript: it never changes scroll height. */
export function StickyUserMessage({ scrollContainer, content, sessionKey }: {
  scrollContainer: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  sessionKey: string;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewHeightRef = useRef(0);
  useEffect(() => {
    const root = scrollContainer.current;
    const column = content.current;
    if (!root || !column) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = root.getBoundingClientRect();
      if (previewRef.current) previewHeightRef.current = previewRef.current.offsetHeight;
      // Remember the height while hidden so the handoff cannot flicker back on.
      const handoff = viewport.top + TOP_GAP + previewHeightRef.current;
      let candidate: HTMLElement | null = null;
      for (const message of column.querySelectorAll<HTMLElement>("[data-user-preview]")) {
        const bounds = message.getBoundingClientRect();
        // Clear as the next prompt meets the preview's bottom edge.
        if (bounds.top > handoff) break;
        // The new preview waits until the entire prompt has left the viewport.
        candidate = bounds.bottom <= viewport.top ? message : null;
      }
      const text = candidate?.dataset.userPreview;
      const bounds = column.getBoundingClientRect();
      const parent = root.parentElement!.getBoundingClientRect();
      const next = text ? { text, left: bounds.left - parent.left, width: bounds.width } : null;
      setPreview(previous => previous?.text === next?.text && previous?.left === next?.left && previous?.width === next?.width ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    resize.observe(column);
    const mutations = new MutationObserver(schedule);
    mutations.observe(column, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-user-preview"] });
    root.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("scroll", schedule);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [scrollContainer, content, sessionKey]);

  if (!preview) return null;
  return (
    <div ref={previewRef} className="sticky-user-preview" aria-hidden="true" style={{ position: "absolute", top: TOP_GAP, left: preview.left, width: preview.width, zIndex: 10, pointerEvents: "none", padding: "8px 12px", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, background: "color-mix(in srgb, var(--user-bg) 65%, transparent)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 3px 8px rgba(0,0,0,0.12)", color: "var(--text)", fontSize: "calc(14px + var(--chat-font-size-offset, 0px))", lineHeight: 1.6, textAlign: "left" }}>
      <div style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview.text}</div>
    </div>
  );
}
