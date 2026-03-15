import React from "react";
import { CornerUpLeft } from "lucide-react";
import { formatTime } from "../../utils/formatTime";

export default function MessageMeta({ isSelf, timestamp, onReply, message }) {
  const timeStr = formatTime(timestamp);

  return (
    <div className={`flex items-center gap-2 mt-1.5 min-w-0 ${isSelf ? "justify-end" : "justify-between"}`}>
      {!isSelf && (
        <button
          onClick={() => onReply?.(message)}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider
                     text-brut-black/40 dark:text-mid-muted
                     hover:text-brut-pink dark:hover:text-brut-pink
                     active:scale-90 transition-all duration-100 -ml-0.5"
          aria-label="Reply"
        >
          <CornerUpLeft size={11} strokeWidth={2.5} /> Reply
        </button>
      )}
      <span className={`font-mono text-[10px] font-bold opacity-35 uppercase select-none shrink-0 ${isSelf ? "" : "ml-auto"}`}>
        {timeStr}
      </span>
      {isSelf && (
        <button
          onClick={() => onReply?.(message)}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider
                     text-brut-black/40 dark:text-mid-text/40
                     hover:text-brut-pink dark:hover:text-brut-pink
                     active:scale-90 transition-all duration-100 -mr-0.5"
          aria-label="Reply"
        >
          Reply <CornerUpLeft size={11} strokeWidth={2.5} className="scale-x-[-1]" />
        </button>
      )}
    </div>
  );
}
