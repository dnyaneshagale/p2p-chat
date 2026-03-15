/**
 * @typedef {Object} MessageReplyTo
 * @property {number|string} id
 * @property {string} from
 * @property {string=} text
 */

/**
 * @typedef {Object} MessageTransfer
 * @property {"offer"|"sending"|"buffering"|"receiving"|"sent"|"failed"} state
 * @property {number=} progress
 * @property {number=} sentBytes
 * @property {number=} totalBytes
 */

/**
 * @typedef {Object} MessageReaction
 * @property {string} emoji
 * @property {number=} count
 * @property {string[]=} reactors
 */

/**
 * @typedef {Object} ChatMessage
 * @property {number|string} id
 * @property {string} from
 * @property {string=} text
 * @property {string=} fileUrl
 * @property {string=} fileName
 * @property {string=} fileType
 * @property {MessageReplyTo=} replyTo
 * @property {number} timestamp
 * @property {boolean} isSelf
 * @property {boolean=} isSystem
 * @property {boolean=} viewOnce
 * @property {boolean=} viewOnceConsumed
 * @property {"sending"|"sent"|"delivered"|"seen"=} status
 * @property {MessageTransfer=} transfer
 * @property {(string|MessageReaction)[]=} reactions
 */

export {};
