import React from "react";

export default function MessageReactions({ reactions, currentUser, floating = false }) {
  if (!Array.isArray(reactions) || reactions.length === 0) return null;

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-brut-black/15 dark:border-mid-border px-1.5 py-1 bg-white/95 dark:bg-mid-surface shadow-[0_2px_10px_rgba(0,0,0,0.15)] ${floating ? "" : "mt-1.5"}`}>
      {reactions.map((r, idx) => {
        const emoji = typeof r === "string" ? r : r.emoji;
        const count = typeof r === "string" ? 1 : (r.count || 1);
        const reactors = typeof r === "string" ? [] : (Array.isArray(r.reactors) ? r.reactors : []);
        const isMine = currentUser && reactors.includes(currentUser);
        if (!emoji) return null;
        return (
          <span
            key={`${emoji}-${idx}`}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-black ${
              isMine
                ? "bg-brut-cyan/20 border-brut-cyan/40 text-brut-cyan"
                : "bg-brut-black/10 dark:bg-white/10 border-brut-black/15 dark:border-mid-border"
            }`}
          >
            <span>{emoji}</span>
            {count > 1 && <span className="font-mono opacity-70">{count}</span>}
          </span>
        );
      })}
    </div>
  );
}
