import React from "react";

export default function MessageReplyPreview({ replyTo }) {
  if (!replyTo) return null;
  return (
    <div className="text-xs px-3 py-1.5 mb-2 rounded-lg font-mono bg-brut-black/10 dark:bg-white/10 border-l-4 border-brut-black dark:border-mid-border">
      <span className="font-black uppercase text-[10px]">{replyTo.from}: </span>
      <span className="opacity-60">{replyTo.text || "Attachment"}</span>
    </div>
  );
}
