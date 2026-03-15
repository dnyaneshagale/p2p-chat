import React from "react";
import MessageBubble from "./MessageBubble";

/**
 * @typedef {import("../types/message").ChatMessage} ChatMessage
 */

/**
 * @param {{
 *   message: ChatMessage,
 *   onReply: (message: ChatMessage) => void,
 *   onOpenMedia: (media: any) => void,
 *   onToggleReaction: (messageId: number|string, emoji: string) => void,
 *   onRespondToFileOffer: (messageId: number|string, accept: boolean) => void,
 *   onConsumeViewOnce: (messageId: number|string) => void,
 *   currentUser: string,
 * }} props
 */
export default function MessageItem({ message, onReply, onOpenMedia, onToggleReaction, onRespondToFileOffer, onConsumeViewOnce, currentUser }) {
  return (
    <div className={`flex ${message.isSelf ? "justify-end" : "justify-start"}`}>
      <MessageBubble
        key={message.id}
        message={message}
        onReply={onReply}
        onOpenMedia={onOpenMedia}
        onToggleReaction={onToggleReaction}
        onRespondToFileOffer={onRespondToFileOffer}
        onConsumeViewOnce={onConsumeViewOnce}
        currentUser={currentUser}
      />
    </div>
  );
}
