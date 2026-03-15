import React from "react";
import { formatBytes } from "../../utils/formatBytes";

export default function MessageTransferProgress({ transfer, fileName, isSelf = false }) {
  if (!transfer || !fileName) return null;

  const total = transfer.totalBytes || 0;
  const sent = Math.min(transfer.sentBytes || 0, total || transfer.sentBytes || 0);
  const progress = Math.max(0, Math.min(100, transfer.progress ?? 0));
  const state = transfer.state;

  if (!isSelf && state === "offer") return null;

  if (!["offer", "sending", "buffering", "receiving", "failed"].includes(state)) return null;

  const isReceiving = state === "receiving";
  const label =
    state === "offer" ? (isSelf ? "Waiting for peer to download" : "Tap download to receive")
    : state === "buffering" ? "Uploading - finalizing"
    : state === "receiving" ? `Downloading ${progress}%`
    : state === "failed" ? "Upload failed"
    : `Uploading ${progress}%`;

  return (
    <div className="mt-2 p-2.5 rounded-xl border border-brut-black/20 dark:border-mid-border bg-brut-black/5 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider opacity-70 truncate max-w-[170px]">
          {fileName}
        </p>
        <span className="text-[10px] font-mono opacity-60 shrink-0">
          {formatBytes(total)}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-brut-black/15 dark:bg-white/15 mt-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${state === "failed" ? "bg-brut-pink" : isReceiving ? "bg-brut-cyan" : "bg-brut-lime"}`}
          style={{ width: `${state === "failed" ? 100 : state === "offer" ? 12 : progress}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono opacity-70">
        <span>{label}</span>
        {state === "failed" ? (
          <span className="font-black text-brut-pink uppercase">Retry</span>
        ) : state === "offer" ? (
          <span>{formatBytes(total)}</span>
        ) : (
          <span>{formatBytes(sent)} / {formatBytes(total)}</span>
        )}
      </div>
    </div>
  );
}
