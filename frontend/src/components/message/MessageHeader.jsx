import React from "react";

export default function MessageHeader({ isSelf, from }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-widest text-brut-black/40 dark:text-mid-muted mb-0.5 px-1">
      {isSelf ? "YOU" : (from || "PEER").toUpperCase()}
    </span>
  );
}
