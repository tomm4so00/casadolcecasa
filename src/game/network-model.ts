import type { ChatMessage } from './models.js';
import { isRecord } from './save-model.js';

export function decodeChatMessage(value: unknown): ChatMessage | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length > 100 ||
    typeof value.text !== 'string' ||
    value.text.length > 200 ||
    typeof value.t !== 'number' ||
    !Number.isFinite(value.t) ||
    value.t < 0 ||
    typeof value.name !== 'string' ||
    value.name.length > 100
  )
    return null;
  return { id: value.id, name: value.name, text: value.text, t: value.t };
}
