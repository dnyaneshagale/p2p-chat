import React, { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import MessageItem from "./MessageItem";

/**
 * @typedef {import("../types/message").ChatMessage} ChatMessage
 */

/**
 * @param {{
 *   messages: ChatMessage[],
 *   onReply: (message: ChatMessage) => void,
 *   onOpenMedia: (media: any) => void,
 *   onToggleReaction: (messageId: number|string, emoji: string) => void,
 *   onRespondToFileOffer: (messageId: number|string, accept: boolean) => void,
 *   onConsumeViewOnce: (messageId: number|string) => void,
 *   currentUser: string,
 *   onLoadOlderHistory?: () => void,
 *   hasMoreHistory?: boolean,
 *   firstItemIndex?: number,
 * }} props
 */
export default function MessageList({
  messages,
  onReply,
  onOpenMedia,
  onToggleReaction,
  onRespondToFileOffer,
  onConsumeViewOnce,
  currentUser,
  onLoadOlderHistory,
  hasMoreHistory = false,
  firstItemIndex = 0,
}) {
  const initialTopMostItemIndex = useMemo(
    () => (messages.length > 0 ? messages.length - 1 : 0),
    [messages.length]
  );

  return (
    <Virtuoso
      className="h-full w-full"
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={initialTopMostItemIndex}
      data={messages}
      followOutput={(isAtBottom) => (isAtBottom ? "smooth" : false)}
      alignToBottom
      startReached={() => {
        if (hasMoreHistory) onLoadOlderHistory?.();
      }}
      increaseViewportBy={{ top: 400, bottom: 600 }}
      itemContent={(index, message) => (
        <div className="px-2.5 sm:px-4 py-0.5 sm:py-1">
          <MessageItem
            key={message.id || index}
            message={message}
            onReply={onReply}
            onOpenMedia={onOpenMedia}
            onToggleReaction={onToggleReaction}
            onRespondToFileOffer={onRespondToFileOffer}
            onConsumeViewOnce={onConsumeViewOnce}
            currentUser={currentUser}
          />
        </div>
      )}
      components={{
        Footer: () => <div style={{ height: 8 }} />,
      }}
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    />
  );
}
