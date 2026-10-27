<!-- eslint-disable vue/multi-word-component-names -->
<script lang="ts" setup>
import {
  ChatDotRound,
  Promotion,
  Refresh,
  Edit,
  Search,
  Paperclip,
  Close,
  Coin,
  Delete,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import {
  getConversations,
  getMessages,
  postSend,
  postUpload,
  postRecall,
  postMute,
  postRead,
  postRename,
  postPin,
  getStorage,
  postSettings,
  postPurge,
  type ChatConsoleConversation,
  type ChatConsoleMention,
  type ChatConsoleMessage,
  type ChatConsoleQuote,
  type ChatConsoleStorage,
} from '~/api/chat_console';

const conversations = ref<ChatConsoleConversation[]>([]);
const activeKey = ref('');
const messages = ref<ChatConsoleMessage[]>([]);
const search = ref('');
const draft = ref('');

const loadingConvs = ref(false);
const loadingMsgs = ref(false);
const loadingMore = ref(false);
const sending = ref(false);
const uploading = ref(false);
const connected = ref(false);
const hasMore = ref(false);

const quote = ref<ChatConsoleQuote | null>(null);
const mentions = ref<ChatConsoleMention[]>([]);
const fileInput = ref<HTMLInputElement>();

// 移动端：会话列表与消息区二选一显示，避免侧栏吃掉半屏
const isNarrow = ref(false);
const mobileListOpen = ref(false);
let narrowQuery: MediaQueryList | null = null;

function syncNarrow(evt?: MediaQueryListEvent) {
  isNarrow.value = evt ? evt.matches : !!narrowQuery?.matches;
  if (!isNarrow.value) mobileListOpen.value = false;
}

const muteDialog = ref(false);
const muteTarget = ref<{ openid: string; name: string } | null>(null);

const storageDialog = ref(false);
const storageLoading = ref(false);
const storage = ref<ChatConsoleStorage | null>(null);
const retentionInput = ref(30);
const savingRetention = ref(false);

const listEl = ref<HTMLDivElement>();

const activeConv = computed(
  () => conversations.value.find(c => c.key === activeKey.value) || null,
);

const filteredConvs = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return conversations.value;
  return conversations.value.filter(
    c => c.name.toLowerCase().includes(q) || c.targetId.toLowerCase().includes(q),
  );
});

const totalUnread = computed(() => conversations.value.reduce((n, c) => n + (c.unread || 0), 0));

/** 从历史消息里归纳出可 @ 的群成员 */
const members = computed(() => {
  const map = new Map<string, string>();
  for (const m of messages.value) {
    if (m.senderOpenId && m.senderName) map.set(m.senderOpenId, m.senderName);
  }
  return [...map.entries()].map(([openid, name]) => ({ openid, name }));
});

function apiBase() {
  const path = window.location.pathname;
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return dir + 'sd-api';
}

function authToken() {
  return localStorage.getItem('t') || '';
}

function formatTime(ts: number) {
  if (!ts) return '';
  const t = dayjs(ts * 1000);
  if (t.isSame(dayjs(), 'day')) return t.format('HH:mm');
  if (t.isSame(dayjs(), 'year')) return t.format('MM-DD HH:mm');
  return t.format('YYYY-MM-DD');
}

/** 官方媒体 URL 走本机代理：浏览器直连腾讯域名常被防盗链/跨域挡住 */
function mediaSrc(url: string) {
  if (!url) return '';
  return `${apiBase()}/chat-console/media?token=${encodeURIComponent(authToken())}&url=${encodeURIComponent(url)}`;
}

/** 去掉文本里的 CQ 码 / @ 标签，表情包标签显示成 [表情]，附件由 media 单独渲染 */
function plainText(text: string) {
  return (text || '')
    .replace(/\[CQ:[^\]]+\]/g, '')
    .replace(/<face[^>]*\/?>/gi, '[表情]')
    .replace(/<qqbot-at-user[^>]*\/>/gi, '@')
    .trim();
}

/** 只有表情/无正文又拿不到附件时给个占位 */
function isPlaceholderMessage(msg: ChatConsoleMessage) {
  return !msg.recalled && !plainText(msg.text) && !(msg.media && msg.media.length > 0);
}

function bubbleClass(msg: ChatConsoleMessage) {
  if (msg.source === 'console') return 'bg-sky-500 text-white';
  if (msg.source === 'bot') return 'bg-emerald-50 text-gray-800 border border-emerald-100';
  return 'bg-white text-gray-800 border border-gray-200';
}

function senderLabel(msg: ChatConsoleMessage) {
  if (msg.source === 'console') return '我';
  if (msg.source === 'bot') return '骰子';
  return msg.senderName || '未知用户';
}

function avatarText(msg: ChatConsoleMessage) {
  return senderLabel(msg).slice(0, 1).toUpperCase();
}

function convIcon(conv: ChatConsoleConversation) {
  return conv.kind === 'group' ? '👥' : '👤';
}

async function togglePin(conv: ChatConsoleConversation) {
  try {
    const res = await postPin(conv.key, !conv.pinned);
    if (res.result) {
      upsertConversation({ ...conv, ...res.conversation });
    } else {
      ElMessage.error(res.err || '置顶失败');
    }
  } catch {
    ElMessage.error('置顶失败，请检查连接');
  }
}

function canRecall(msg: ChatConsoleMessage) {
  return msg.dir === 'out' && !!msg.msgId && !msg.recalled;
}

function canMute(msg: ChatConsoleMessage) {
  return (
    activeConv.value?.kind === 'group' && msg.dir === 'in' && !!msg.senderOpenId && !msg.recalled
  );
}

function upsertConversation(conv: ChatConsoleConversation) {
  const i = conversations.value.findIndex(c => c.key === conv.key);
  if (i >= 0) {
    conversations.value[i] = { ...conversations.value[i], ...conv };
  } else {
    conversations.value.unshift(conv);
  }
  // 正在看的会话不需要未读角标
  const cur = conversations.value.find(c => c.key === activeKey.value);
  if (cur) cur.unread = 0;
  // 置顶在前，其余按最后消息时间倒序
  conversations.value.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastTs || 0) - (a.lastTs || 0);
  });
}

async function loadConversations(silent = false) {
  if (!silent) loadingConvs.value = true;
  try {
    const res = await getConversations();
    if (res.result) {
      conversations.value = res.conversations;
      if (!activeKey.value && conversations.value.length > 0) {
        await selectConversation(conversations.value[0]);
      }
    } else if (!silent) {
      ElMessage.error(res.err || '读取会话列表失败');
    }
  } catch {
    if (!silent) ElMessage.error('读取会话列表失败，请检查连接');
  } finally {
    loadingConvs.value = false;
  }
}

async function selectConversation(conv: ChatConsoleConversation) {
  activeKey.value = conv.key;
  messages.value = [];
  hasMore.value = false;
  quote.value = null;
  mentions.value = [];
  if (isNarrow.value) mobileListOpen.value = false;
  await loadMessages();
  if (conv.unread) {
    conv.unread = 0;
    try {
      await postRead(conv.key);
    } catch {
      // 已读失败不影响浏览
    }
  }
}

function nearBottom() {
  const el = listEl.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
}

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function loadMessages() {
  if (!activeKey.value) return;
  loadingMsgs.value = true;
  try {
    const res = await getMessages({ key: activeKey.value, limit: 50 });
    if (res.result) {
      messages.value = res.messages;
      hasMore.value = res.hasMore;
      scrollToBottom();
    } else {
      ElMessage.error(res.err || '读取消息失败');
    }
  } catch {
    ElMessage.error('读取消息失败');
  } finally {
    loadingMsgs.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !activeKey.value || messages.value.length === 0) return;
  loadingMore.value = true;
  const el = listEl.value;
  const prevHeight = el?.scrollHeight || 0;
  try {
    const res = await getMessages({
      key: activeKey.value,
      before: messages.value[0].ts,
      limit: 50,
    });
    if (res.result) {
      messages.value = [...res.messages, ...messages.value];
      hasMore.value = res.hasMore;
      nextTick(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    }
  } catch {
    ElMessage.error('加载更早的消息失败');
  } finally {
    loadingMore.value = false;
  }
}

async function send() {
  const text = draft.value.trim();
  if ((!text && mentions.value.length === 0) || !activeKey.value || sending.value) return;
  sending.value = true;
  try {
    const res = await postSend(activeKey.value, text, quote.value, mentions.value);
    if (res.result) {
      appendMessage(res.message);
      draft.value = '';
      quote.value = null;
      mentions.value = [];
    } else {
      ElMessage.error(res.err || '发送失败');
    }
  } catch {
    ElMessage.error('发送失败，请检查连接');
  } finally {
    sending.value = false;
  }
}

/** Enter 发送；中文输入法组词时的 Enter 不算发送 */
function onEnter(evt: Event | KeyboardEvent) {
  const e = evt as KeyboardEvent;
  if (e.isComposing) return;
  e.preventDefault();
  send();
}

function appendMessage(msg: ChatConsoleMessage) {
  if (!msg) return;
  const i = messages.value.findIndex(m => m.id === msg.id);
  if (i >= 0) {
    messages.value[i] = { ...messages.value[i], ...msg };
    return;
  }
  const stick = nearBottom();
  messages.value.push(msg);
  if (stick) scrollToBottom();
}

// ---------------- 引用 / @ ----------------

function startQuote(msg: ChatConsoleMessage) {
  quote.value = {
    sender: senderLabel(msg),
    text: plainText(msg.text).slice(0, 200) || '[非文本消息]',
  };
}

function addMention(m: { openid: string; name: string }) {
  if (mentions.value.some(x => x.openid === m.openid)) return;
  mentions.value.push(m);
}

function removeMention(openid: string) {
  mentions.value = mentions.value.filter(m => m.openid !== openid);
}

// ---------------- 撤回 / 禁言 ----------------

async function recall(msg: ChatConsoleMessage) {
  if (!activeKey.value || !msg.msgId) return;
  try {
    await ElMessageBox.confirm('撤回这条消息？只能撤回机器人自己发的消息。', '撤回', {
      confirmButtonText: '撤回',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res = await postRecall(activeKey.value, msg.msgId);
    if (res.result) {
      appendMessage(res.message);
      ElMessage.success('已撤回');
    } else {
      ElMessage.error(res.err || '撤回失败');
    }
  } catch {
    ElMessage.error('撤回失败，请检查连接');
  }
}

function openMute(msg: ChatConsoleMessage) {
  if (!msg.senderOpenId) return;
  muteTarget.value = { openid: msg.senderOpenId, name: senderLabel(msg) };
  muteDialog.value = true;
}

async function doMute(seconds: number) {
  const target = muteTarget.value;
  if (!target || !activeKey.value) return;
  try {
    const res = await postMute(activeKey.value, target.openid, seconds);
    if (res.result) {
      ElMessage.success(res.text || '操作成功');
      muteDialog.value = false;
    } else {
      ElMessage.error(res.err || '禁言失败');
    }
  } catch {
    ElMessage.error('禁言失败，请检查连接');
  }
}

// ---------------- 存储占用 / 保留天数 / 清空 ----------------

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function loadStorage() {
  storageLoading.value = true;
  try {
    const res = await getStorage();
    if (res.result) {
      storage.value = res;
      retentionInput.value = res.retentionDays;
    } else {
      ElMessage.error(res.err || '读取存储占用失败');
    }
  } catch {
    ElMessage.error('读取存储占用失败');
  } finally {
    storageLoading.value = false;
  }
}

function openStorage() {
  storageDialog.value = true;
  loadStorage();
}

async function saveRetention() {
  const days = Number(retentionInput.value);
  if (!Number.isFinite(days) || days < 0) {
    ElMessage.warning('保留天数不能为负数（0 表示永久保留）');
    return;
  }
  savingRetention.value = true;
  try {
    const res = await postSettings(Math.floor(days));
    if (res.result) {
      retentionInput.value = res.retentionDays;
      ElMessage.success(`已保存：保留 ${res.retentionDays === 0 ? '全部历史' : res.retentionDays + ' 天'}`);
      await loadStorage();
      await loadConversations(true);
    } else {
      ElMessage.error(res.err || '保存失败');
    }
  } catch {
    ElMessage.error('保存失败，请检查连接');
  } finally {
    savingRetention.value = false;
  }
}

async function purgeConversation(item: { key: string; name?: string }) {
  try {
    await ElMessageBox.confirm(
      `清空「${item.name || item.key}」的全部历史消息？会话本身和群名会保留。`,
      '清空会话历史',
      { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const res = await postPurge(item.key, false);
    if (res.result) {
      ElMessage.success('已清空');
      await loadStorage();
      if (item.key === activeKey.value) await loadMessages();
      await loadConversations(true);
    } else {
      ElMessage.error(res.err || '清空失败');
    }
  } catch {
    ElMessage.error('清空失败，请检查连接');
  }
}

async function purgeAll() {
  try {
    await ElMessageBox.confirm(
      '清空全部会话历史（所有群/私聊，不可恢复）？保留天数设置会保留。',
      '清空全部历史',
      { confirmButtonText: '全部清空', cancelButtonText: '取消', type: 'error' },
    );
  } catch {
    return;
  }
  try {
    const res = await postPurge(undefined, true);
    if (res.result) {
      messages.value = [];
      activeKey.value = '';
      ElMessage.success('已清空全部历史');
      await loadStorage();
      await loadConversations(true);
    } else {
      ElMessage.error(res.err || '清空失败');
    }
  } catch {
    ElMessage.error('清空失败，请检查连接');
  }
}

// ---------------- 图片 / 文件 ----------------

function pickFile() {
  fileInput.value?.click();
}

async function onFileChange(evt: Event) {
  const input = evt.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !activeKey.value) return;
  uploading.value = true;
  try {
    const res = await postUpload(activeKey.value, file);
    if (res.result) {
      appendMessage(res.message);
    } else {
      ElMessage.error(res.err || '上传失败');
    }
  } catch {
    ElMessage.error('上传失败，请检查连接或文件大小（≤30MB）');
  } finally {
    uploading.value = false;
  }
}

// ---------------- 会话操作 ----------------

async function renameCurrent() {
  const conv = activeConv.value;
  if (!conv) return;
  try {
    const { value } = await ElMessageBox.prompt('给这个会话起个名字', '重命名会话', {
      inputValue: conv.name,
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
    if (!value) return;
    const res = await postRename(conv.key, value);
    if (res.result) {
      upsertConversation({ ...conv, ...res.conversation });
    } else {
      ElMessage.error(res.err || '重命名失败');
    }
  } catch {
    // 用户取消
  }
}

async function copyTargetId() {
  const conv = activeConv.value;
  if (!conv) return;
  try {
    await navigator.clipboard.writeText(conv.targetId);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

// ---------------- 实时推送（SSE）----------------

let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastReadAt = 0;

/** 正在看的会话收到新消息时顺手清掉服务端未读（节流，避免每条消息都请求） */
function markActiveRead() {
  if (!activeKey.value) return;
  const now = Date.now();
  if (now - lastReadAt < 5000) return;
  lastReadAt = now;
  postRead(activeKey.value).catch(() => {
    // 已读失败不影响浏览
  });
}

/** SSE 断开时的兜底：会话列表 + 当前会话的最新一页 */
function pollOnce() {
  if (connected.value) return;
  loadConversations(true);
  if (!activeKey.value) return;
  getMessages({ key: activeKey.value, limit: 50 })
    .then(res => {
      if (res.result) res.messages.forEach(m => appendMessage(m));
    })
    .catch(() => {
      // 轮询失败下一个周期再试
    });
}

function startStream() {
  stopStream();
  try {
    const url = `${apiBase()}/chat-console/events?token=${encodeURIComponent(authToken())}`;
    eventSource = new EventSource(url);

    eventSource.addEventListener('ready', () => {
      connected.value = true;
    });

    eventSource.addEventListener('message', (ev: MessageEvent) => {
      connected.value = true;
      try {
        const payload = JSON.parse(ev.data) as {
          conversation?: ChatConsoleConversation;
          message?: ChatConsoleMessage;
        };
        if (payload.conversation) upsertConversation(payload.conversation);
        if (payload.message && payload.conversation?.key === activeKey.value) {
          appendMessage(payload.message);
          markActiveRead();
        }
      } catch {
        // 忽略无法解析的事件
      }
    });

    eventSource.addEventListener('recall', (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data) as {
          conversation?: ChatConsoleConversation;
          message?: ChatConsoleMessage;
        };
        if (payload.conversation) upsertConversation(payload.conversation);
        if (payload.message && payload.conversation?.key === activeKey.value) {
          appendMessage(payload.message);
        }
      } catch {
        // 忽略
      }
    });

    eventSource.addEventListener('conversation', (ev: MessageEvent) => {
      connected.value = true;
      try {
        const payload = JSON.parse(ev.data) as { conversation?: ChatConsoleConversation };
        if (payload.conversation) upsertConversation(payload.conversation);
      } catch {
        // 忽略
      }
    });

    eventSource.onerror = () => {
      connected.value = false;
      // 浏览器会自动重连；如果长时间失败，用轮询兜底。
      if (!pollTimer) {
        pollTimer = setInterval(pollOnce, 8000);
      }
    };
  } catch {
    connected.value = false;
  }
}

function stopStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(async () => {
  narrowQuery = window.matchMedia('(max-width: 768px)');
  syncNarrow();
  narrowQuery.addEventListener('change', syncNarrow);
  await loadConversations();
  startStream();
});

onBeforeUnmount(() => {
  narrowQuery?.removeEventListener('change', syncNarrow);
  stopStream();
});
</script>

<template>
  <div class="flex flex-col" :style="{ height: 'calc(100vh - 124px)', minHeight: '520px' }">
    <div class="flex items-center justify-between mb-3 flex-none">
      <div class="flex items-center gap-2">
        <el-icon :size="20"><ChatDotRound /></el-icon>
        <span class="text-lg font-medium">官方 QQ 聊天控制台</span>
        <el-tag v-if="totalUnread > 0" type="danger" size="small" round>{{ totalUnread }} 条未读</el-tag>
      </div>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <span class="flex items-center gap-1">
          <span
            class="inline-block w-2 h-2 rounded-full"
            :class="connected ? 'bg-emerald-500' : 'bg-gray-300'"></span>
          {{ connected ? '实时连接中' : '未连接（自动重连）' }}
        </span>
        <el-button size="small" :icon="Refresh" @click="loadConversations()">刷新</el-button>
        <el-button size="small" :icon="Coin" @click="openStorage">存储</el-button>
        <el-button v-if="isNarrow && !mobileListOpen" size="small" @click="mobileListOpen = true">
          会话
        </el-button>
      </div>
    </div>

    <div class="flex flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm">
      <!-- 会话列表 -->
      <div
        class="flex-none border-r border-gray-200 flex flex-col bg-gray-50"
        :class="isNarrow ? (mobileListOpen ? 'w-full' : 'hidden') : 'w-64'">
        <div class="p-2 flex-none">
          <el-input v-model="search" size="small" placeholder="搜索会话" :prefix-icon="Search" clearable />
        </div>
        <div v-loading="loadingConvs" class="flex-1 overflow-y-auto">
          <div v-if="filteredConvs.length === 0" class="text-center text-xs text-gray-400 py-8 px-4">
            还没有记录到官方 QQ 消息。<br />等机器人收到消息后会自动出现。
          </div>
          <div
            v-for="conv in filteredConvs"
            :key="conv.key"
            class="px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-gray-100 transition group"
            :class="conv.key === activeKey ? 'bg-sky-50 border-l-2 border-l-sky-500' : ''"
            @click="selectConversation(conv)">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1 min-w-0">
                <el-avatar
                  v-if="conv.kind === 'c2c' && conv.avatarUrl"
                  :size="20"
                  :src="mediaSrc(conv.avatarUrl)" />
                <span v-else class="text-xs">{{ convIcon(conv) }}</span>
                <span v-if="conv.pinned" class="text-[10px] text-amber-500">📌</span>
                <span class="text-sm font-medium truncate">{{ conv.name }}</span>
                <span v-if="!conv.online" class="text-[10px] text-gray-400">离线</span>
              </div>
              <div class="flex items-center gap-1 flex-none">
                <span
                  class="text-[11px] cursor-pointer opacity-0 group-hover:opacity-100 transition"
                  :class="conv.pinned ? 'text-amber-500 opacity-100' : 'text-gray-400'"
                  :title="conv.pinned ? '取消置顶' : '置顶'"
                  @click.stop="togglePin(conv)">📌</span>
                <span class="text-[10px] text-gray-400">{{ formatTime(conv.lastTs) }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 mt-0.5">
              <span class="text-xs text-gray-500 truncate">{{ conv.lastText || '（暂无消息）' }}</span>
              <span
                v-if="conv.unread > 0"
                class="flex-none text-[10px] leading-4 px-1.5 rounded-full bg-red-500 text-white">
                {{ conv.unread > 99 ? '99+' : conv.unread }}
              </span>
            </div>
            <div v-if="conv.kind === 'group' && !conv.fullMessage" class="mt-1">
              <el-tag size="small" type="warning" effect="plain">仅 @ 消息</el-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 消息区 -->
      <div class="min-w-0 flex flex-col" :class="isNarrow && mobileListOpen ? 'hidden' : 'flex-1'">
        <template v-if="activeConv">
          <div class="px-4 py-2 border-b border-gray-200 flex items-center justify-between flex-none">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium truncate">{{ activeConv.name }}</span>
                <el-tag v-if="activeConv.kind === 'group'" size="small" type="info">
                  群聊<span v-if="activeConv.memberCount"> · {{ activeConv.memberCount }} 人</span>
                </el-tag>
                <el-tag v-else size="small" type="info">私聊</el-tag>
              </div>
              <div class="text-[11px] text-gray-400 truncate">{{ activeConv.targetId }}</div>
            </div>
            <div class="flex items-center gap-1 flex-none">
              <el-button v-if="isNarrow" size="small" text @click="mobileListOpen = true">← 会话</el-button>
              <el-button size="small" text @click="copyTargetId">复制 ID</el-button>
              <el-button size="small" text :icon="Edit" @click="renameCurrent">改名</el-button>
            </div>
          </div>

          <el-alert
            v-if="activeConv.kind === 'group' && !activeConv.fullMessage"
            class="flex-none rounded-none"
            type="warning"
            :closable="false"
            show-icon
            title="该群未开启「获取全部群消息」，控制台只能看到 @ 机器人的消息。请在官方群设置里授权后，群内全部消息才会推送过来。" />

          <div ref="listEl" v-loading="loadingMsgs" class="flex-1 overflow-y-auto px-4 py-3 bg-gray-100">
            <div v-if="hasMore" class="text-center mb-2">
              <el-button size="small" text :loading="loadingMore" @click="loadMore">加载更早的消息</el-button>
            </div>

            <div v-if="messages.length === 0 && !loadingMsgs" class="text-center text-xs text-gray-400 py-10">
              这里还没有消息（官方平台不提供历史回溯，只能记录开启后的消息）
            </div>

            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex gap-2 mb-3 group"
              :class="msg.source === 'console' ? 'flex-row-reverse' : ''">
              <el-avatar
                v-if="msg.avatarUrl"
                :size="28"
                :src="mediaSrc(msg.avatarUrl)"
                class="flex-none" />
              <div
                v-else
                class="w-7 h-7 rounded-full flex-none flex items-center justify-center text-xs text-white"
                :class="msg.source === 'console' ? 'bg-sky-500' : msg.source === 'bot' ? 'bg-emerald-500' : 'bg-gray-400'">
                {{ avatarText(msg) }}
              </div>
              <div class="max-w-[70%] flex flex-col" :class="msg.source === 'console' ? 'items-end' : 'items-start'">
                <div class="text-[11px] text-gray-400 mb-0.5">
                  {{ senderLabel(msg) }}
                  <span class="ml-1">{{ formatTime(msg.ts) }}</span>
                </div>

                <div class="flex items-center gap-1" :class="msg.source === 'console' ? 'flex-row-reverse' : ''">
                  <div class="px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words" :class="bubbleClass(msg)">
                    <div v-if="msg.recalled" class="italic text-xs opacity-70">该消息已被撤回</div>
                    <template v-else>
                      <div
                        v-if="msg.quote"
                        class="text-[11px] opacity-70 border-l-2 pl-1.5 mb-1 whitespace-pre-wrap">
                        {{ msg.quote.sender }}：{{ msg.quote.text }}
                      </div>
                      <span v-if="plainText(msg.text)">{{ plainText(msg.text) }}</span>
                      <span v-else-if="isPlaceholderMessage(msg)" class="text-xs opacity-70">[表情/图片（无法获取内容）]</span>
                      <div v-if="msg.media && msg.media.length > 0" class="mt-1 flex flex-col gap-1">
                        <template v-for="(m, i) in msg.media" :key="i">
                          <el-image
                            v-if="m.kind === 'image'"
                            :src="mediaSrc(m.url)"
                            :preview-src-list="[mediaSrc(m.url)]"
                            :preview-teleported="true"
                            fit="cover"
                            class="max-w-[220px] rounded cursor-zoom-in" />
                          <a
                            v-else
                            :href="mediaSrc(m.url)"
                            target="_blank"
                            rel="noreferrer"
                            class="text-xs underline break-all">
                            📎 {{ m.name || (m.kind === 'record' ? '语音' : '文件') }}
                          </a>
                        </template>
                      </div>
                    </template>
                  </div>

                  <div class="opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                    <el-button link size="small" @click="startQuote(msg)">回复</el-button>
                    <el-button v-if="canRecall(msg)" link size="small" @click="recall(msg)">撤回</el-button>
                    <el-button v-if="canMute(msg)" link size="small" @click="openMute(msg)">禁言</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="border-t border-gray-200 p-2 flex-none bg-white">
            <!-- 引用条 -->
            <div v-if="quote" class="mb-2 px-2 py-1 rounded bg-gray-100 text-xs text-gray-600 flex items-start gap-2">
              <span class="flex-1 break-all">回复 {{ quote.sender }}：{{ quote.text }}</span>
              <el-button link size="small" :icon="Close" @click="quote = null" />
            </div>

            <!-- @ 成员 -->
            <div v-if="mentions.length > 0" class="mb-2 flex flex-wrap gap-1">
              <el-tag
                v-for="m in mentions"
                :key="m.openid"
                size="small"
                closable
                @close="removeMention(m.openid)">
                @{{ m.name }}
              </el-tag>
            </div>

            <el-input
              v-model="draft"
              type="textarea"
              :rows="2"
              resize="none"
              maxlength="1500"
              show-word-limit
              placeholder="以机器人身份发送消息，Enter 发送，Shift+Enter 换行"
              @keydown.enter.exact="onEnter" />

            <input ref="fileInput" type="file" class="hidden" @change="onFileChange" />

            <div class="flex items-center justify-between mt-2">
              <div class="flex items-center gap-1">
                <el-button
                  size="small"
                  :icon="Paperclip"
                  :loading="uploading"
                  title="发送图片 / 文件（≤30MB）"
                  @click="pickFile">图片/文件</el-button>

                <el-popover v-if="activeConv.kind === 'group'" placement="top" :width="220" trigger="click">
                  <template #reference>
                    <el-button size="small">@成员</el-button>
                  </template>
                  <div class="max-h-56 overflow-y-auto">
                    <div v-if="members.length === 0" class="text-xs text-gray-400 p-2">
                      还没有群成员记录（收到过消息的成员才会出现）
                    </div>
                    <div
                      v-for="m in members"
                      :key="m.openid"
                      class="px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 rounded"
                      @click="addMention(m)">
                      {{ m.name }}
                    </div>
                  </div>
                </el-popover>

                <span class="text-[11px] text-gray-400 ml-1">
                  私聊主动消息受官方额度限制，发送失败会给出原因
                </span>
              </div>
              <el-button type="primary" size="small" :icon="Promotion" :loading="sending" @click="send">
                发送
              </el-button>
            </div>
          </div>
        </template>

        <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-400">
          左侧选择一个会话开始聊天
        </div>
      </div>
    </div>

    <el-dialog v-model="storageDialog" title="存储占用与保留策略" width="680px">
      <div v-loading="storageLoading">
        <div class="flex items-center gap-3 mb-3 flex-wrap">
          <span class="text-sm">保留天数</span>
          <el-input-number v-model="retentionInput" :min="0" :max="3650" :step="1" size="small" />
          <el-button size="small" type="primary" :loading="savingRetention" @click="saveRetention">
            保存
          </el-button>
          <span class="text-xs text-gray-400">0 = 永久保留；保存后立刻按新规则清理一次</span>
        </div>

        <div class="text-xs text-gray-500 mb-2">
          合计占用 <b>{{ formatBytes(storage?.totalBytes || 0) }}</b>
          · 会话 {{ storage?.conversations?.length || 0 }} 个
          · 媒体只存链接、不存原件
        </div>

        <el-table :data="storage?.conversations || []" height="340" size="small" border>
          <el-table-column label="会话" min-width="200">
            <template #default="{ row }">
              <span>{{ row.name || row.key }}</span>
              <span class="text-[10px] text-gray-400 ml-1">
                {{ row.kind === 'group' ? '群' : row.kind === 'c2c' ? '私聊' : '' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="消息" width="90" prop="messages" />
          <el-table-column label="天数" width="80" prop="days" />
          <el-table-column label="占用" width="110">
            <template #default="{ row }">{{ formatBytes(row.bytes) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90">
            <template #default="{ row }">
              <el-button link type="danger" size="small" :icon="Delete" @click="purgeConversation(row)">
                清空
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="flex justify-end mt-3">
          <el-button size="small" type="danger" plain :icon="Delete" @click="purgeAll">
            清空全部历史
          </el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="muteDialog" title="禁言群成员" width="420px">
      <div class="text-sm mb-3">
        {{ muteTarget?.name || '' }}
        <span class="text-xs text-gray-400">（{{ muteTarget?.openid }}）</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button size="small" @click="doMute(60)">1 分钟</el-button>
        <el-button size="small" @click="doMute(600)">10 分钟</el-button>
        <el-button size="small" @click="doMute(3600)">1 小时</el-button>
        <el-button size="small" @click="doMute(86400)">1 天</el-button>
        <el-button size="small" type="danger" plain @click="doMute(0)">解除禁言</el-button>
      </div>
      <div class="text-xs text-gray-400 mt-3">
        需要机器人是群管理员；官方单次最长 30 天，不能禁言群主或其他管理员。
      </div>
    </el-dialog>
  </div>
</template>
