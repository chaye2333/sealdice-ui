import { createRequest } from '..';

const request = createRequest('/chat-console/');

export interface ChatConsoleMedia {
  kind: 'image' | 'record' | 'video' | 'file';
  url: string;
  name?: string;
}

export interface ChatConsoleQuote {
  sender: string;
  text: string;
}

export interface ChatConsoleMention {
  openid: string;
  name: string;
}

export interface ChatConsoleMessage {
  id: string;
  ts: number;
  dir: 'in' | 'out';
  source: 'user' | 'bot' | 'console';
  senderId: string;
  senderName: string;
  senderOpenId?: string;
  text: string;
  media?: ChatConsoleMedia[];
  msgId?: string;
  quote?: ChatConsoleQuote;
  recalled?: boolean;
  recalledAt?: number;
}

export interface ChatConsoleConversation {
  key: string;
  kind: 'group' | 'c2c';
  targetId: string;
  uin?: string;
  endpointId?: string;
  name: string;
  nameManual: boolean;
  memberCount?: number;
  fullMessage: boolean;
  lastTs: number;
  lastText: string;
  unread: number;
  updatedAt: number;
  online: boolean;
}

export interface ChatConsoleUsage {
  key: string;
  name?: string;
  kind?: string;
  bytes: number;
  messages: number;
  days: number;
  oldestTs?: number;
  newestTs?: number;
}

export interface ChatConsoleStorage {
  totalBytes: number;
  retentionDays: number;
  conversations: ChatConsoleUsage[];
}

type FailResponse = { result: false; err?: string };
type OkResponse<T> = { result: true } & T;

export async function getConversations() {
  return await request<FailResponse | OkResponse<{ conversations: ChatConsoleConversation[] }>>(
    'get',
    'conversations',
  );
}

export async function getMessages(params: { key: string; before?: number; limit?: number }) {
  return await request<
    FailResponse | OkResponse<{ messages: ChatConsoleMessage[]; hasMore: boolean }>
  >('get', 'messages', params);
}

export async function postSend(
  key: string,
  text: string,
  quote?: ChatConsoleQuote | null,
  mentions?: ChatConsoleMention[],
) {
  // 官方主动消息可能排队，给发送单独放宽超时（默认 10s 太短）
  return await request<FailResponse | OkResponse<{ message: ChatConsoleMessage }>>(
    'post',
    'send',
    { key, text, quote: quote || undefined, mentions: mentions?.length ? mentions : undefined },
    undefined,
    { timeout: 40000 },
  );
}

/** 发送图片 / 语音 / 视频 / 文件（富媒体上传比文本慢，超时放宽） */
export async function postUpload(key: string, file: File) {
  return await request<FailResponse | OkResponse<{ message: ChatConsoleMessage }>>(
    'post',
    'upload',
    { key, file },
    'formdata',
    { timeout: 180000 },
  );
}

export async function postRecall(key: string, msgId: string) {
  return await request<FailResponse | OkResponse<{ message: ChatConsoleMessage }>>('post', 'recall', {
    key,
    msgId,
  });
}

export async function postMute(key: string, memberOpenId: string, seconds: number) {
  return await request<FailResponse | OkResponse<{ text: string }>>('post', 'mute', {
    key,
    memberOpenId,
    seconds,
  });
}

export async function postRead(key: string) {
  return await request<FailResponse | OkResponse<Record<string, never>>>('post', 'read', { key });
}

export async function postRename(key: string, name: string) {
  return await request<FailResponse | OkResponse<{ conversation: ChatConsoleConversation }>>(
    'post',
    'rename',
    { key, name },
  );
}

/** 存储占用 + 保留天数 */
export async function getStorage() {
  return await request<FailResponse | OkResponse<ChatConsoleStorage>>('get', 'storage');
}

/** 调整保留天数；0 = 永久保留 */
export async function postSettings(retentionDays: number) {
  return await request<FailResponse | OkResponse<{ retentionDays: number }>>('post', 'settings', {
    retentionDays,
  });
}

/** 清空单个会话（传 key）或全部（all=true） */
export async function postPurge(key?: string, all = false) {
  return await request<FailResponse | OkResponse<Record<string, never>>>('post', 'purge', {
    key,
    all,
  });
}
