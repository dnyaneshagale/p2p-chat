import React from "react";

export default function MessageText({ text }) {
  if (!text) return null;
  return <p className="text-sm font-medium leading-relaxed break-words [overflow-wrap:anywhere]">{text}</p>;
}
