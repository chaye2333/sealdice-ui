<script setup lang="ts">
import dayjs from 'dayjs';
import { Upload, Refresh, CopyDocument, Delete, Picture } from '@element-plus/icons-vue';
import {
  getMediaImages,
  postMediaImage,
  deleteMediaImage,
  type OfficialQQMediaBot,
  type OfficialQQMediaImage,
} from '~/api/official_qq_media';

const LIMIT = 100;
const MAX_BYTES = 10 << 20;

const bots = ref<OfficialQQMediaBot[]>([]);
const endpointId = ref('');
const images = ref<OfficialQQMediaImage[]>([]);
const total = ref(0);
const nextCursor = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const uploading = ref(false);
const loaded = ref(false);
const errorText = ref('');
/** 平台不返回宽高时的兜底：缩略图加载后记 naturalWidth/Height */
const measured = reactive<Record<string, { width: number; height: number }>>({});

const botOptions = computed(() =>
  bots.value.map(bot => ({ label: `${bot.name}（${bot.appId}）`, value: bot.id })),
);

const uploadDisabled = computed(
  () => uploading.value || (loaded.value && bots.value.length === 0) || total.value >= LIMIT,
);

function apiBase() {
  const path = window.location.pathname;
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return dir + 'sd-api';
}

function authToken() {
  return localStorage.getItem('t') || '';
}

/** 预览图走本机代理：浏览器直连腾讯 COS 常被防盗链/跨域挡住 */
function mediaSrc(url: string) {
  if (!url) return '';
  return `${apiBase()}/chat-console/media?token=${encodeURIComponent(authToken())}&url=${encodeURIComponent(url)}`;
}

function formatTs(ts: number | undefined) {
  if (!ts) return '—';
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm');
}

function sizeOf(item: OfficialQQMediaImage) {
  if (item.width && item.height) return { width: item.width, height: item.height };
  return measured[item.imageId] || { width: 0, height: 0 };
}

function sizeText(item: OfficialQQMediaImage) {
  const size = sizeOf(item);
  return size.width > 0 && size.height > 0 ? `${size.width} × ${size.height}` : '未知';
}

/** alt 文本去掉扩展名与破坏 Markdown 的字符 */
function altText(fileName: string) {
  const base = (fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[\[\]\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base || '图片';
}

/** ![说明 #宽px #高px](qqbot-media://image/v1/<token>) */
function markdownFor(item: OfficialQQMediaImage) {
  const size = sizeOf(item);
  const dims = size.width > 0 && size.height > 0 ? ` #${size.width}px #${size.height}px` : '';
  return `![${altText(item.fileName)}${dims}](${item.url})`;
}

function onThumbLoad(item: OfficialQQMediaImage, event: Event) {
  if (item.width && item.height) return;
  const el = event.target as HTMLImageElement | null;
  if (!el || !el.naturalWidth || !el.naturalHeight) return;
  measured[item.imageId] = { width: el.naturalWidth, height: el.naturalHeight };
}

async function reload() {
  loading.value = true;
  errorText.value = '';
  try {
    const res = await getMediaImages({ endpointId: endpointId.value });
    if (!res.result) {
      errorText.value = res.err || '加载图片列表失败';
      return;
    }
    bots.value = res.bots || [];
    if (!endpointId.value && res.endpointId) endpointId.value = res.endpointId;
    images.value = res.images || [];
    total.value = res.total || 0;
    nextCursor.value = res.nextCursor || '';
  } catch (e: any) {
    errorText.value = e?.message || '加载图片列表失败';
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const res = await getMediaImages({ endpointId: endpointId.value, cursor: nextCursor.value });
    if (!res.result) {
      ElMessage.error(res.err || '加载更多图片失败');
      return;
    }
    const seen = new Set(images.value.map(item => item.imageId));
    images.value = [...images.value, ...(res.images || []).filter(item => !seen.has(item.imageId))];
    total.value = res.total || total.value;
    nextCursor.value = res.nextCursor || '';
  } catch (e: any) {
    ElMessage.error(`加载更多图片失败：${e?.message || e}`);
  } finally {
    loadingMore.value = false;
  }
}

function onBotChange() {
  nextCursor.value = '';
  reload();
}

async function beforeUpload(file: any) {
  if (!file) return false;
  if (file.size > MAX_BYTES) {
    ElMessage.error('图片超过 10MB 上限');
    return false;
  }
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
    ElMessage.error('只支持 png / jpeg / gif / webp 图片');
    return false;
  }
  if (uploading.value) return false;
  uploading.value = true;
  try {
    const res = await postMediaImage(endpointId.value, file);
    if (!res.result) {
      ElMessage.error(res.err || '上传图片失败');
      return false;
    }
    if (res.endpointId) endpointId.value = res.endpointId;
    const image = res.image;
    if (image) {
      images.value = [image, ...images.value.filter(item => item.imageId !== image.imageId)];
      total.value += 1;
      if (image.width && image.height) {
        measured[image.imageId] = { width: image.width, height: image.height };
      }
    }
    ElMessage.success('上传成功，已自动记住图片宽高');
  } catch (e: any) {
    ElMessage.error(`上传图片失败：${e?.message || e}`);
  } finally {
    uploading.value = false;
  }
  // 阻止 el-upload 自己再发一次请求
  return false;
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('复制失败');
}

async function copyMarkdown(item: OfficialQQMediaImage) {
  const text = markdownFor(item);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
  } catch {
    fallbackCopy(text);
  }
  const size = sizeOf(item);
  if (size.width > 0 && size.height > 0) {
    ElMessage.success('已复制 Markdown 片段');
  } else {
    ElMessage.warning('没拿到图片宽高，已复制不带尺寸的引用（刷新后可重试）');
  }
}

async function remove(item: OfficialQQMediaImage) {
  try {
    await ElMessageBox.confirm('删除后引用链接立即失效，确定删除这张图片？', '删除图片', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    const res = await deleteMediaImage(endpointId.value, item.imageId);
    if (!res.result) {
      ElMessage.error(res.err || '删除图片失败');
      return;
    }
    images.value = images.value.filter(image => image.imageId !== item.imageId);
    total.value = Math.max(0, total.value - 1);
    ElMessage.success('已删除');
  } catch (e: any) {
    ElMessage.error(`删除图片失败：${e?.message || e}`);
  }
}

onBeforeMount(() => {
  reload();
});
</script>

<template>
  <h2>MD 图片管理</h2>
  <div class="tip">
    <el-collapse class="helptips">
      <el-collapse-item name="1">
        <template #title>
          <el-text tag="strong">查看帮助</el-text>
        </template>
        <el-text tag="p">
          <div>
            官方 QQ 给每个机器人 100 张 Markdown 图片额度。上传后得到
            <code>qqbot-media://</code> 引用，在 Markdown 消息里写
            <code>![说明 #宽px #高px](qqbot-media://image/v1/…)</code> 即可，不依赖公网地址。
          </div>
          <div>
            限制：单张 ≤ 10MB，仅 png / jpeg / gif / webp；图片在 90 天内被引用会自动续期；
            删除图片可以释放额度。本页上传时会自动补上图片宽高。
          </div>
        </el-text>
      </el-collapse-item>
    </el-collapse>
  </div>

  <el-alert
    v-if="loaded && bots.length === 0"
    class="mb-3"
    type="warning"
    :closable="false"
    show-icon
    title="还没有接入官方 QQ 机器人。先到「账号连接」添加并连上官方 QQ 机器人，才能管理 Markdown 图片素材。" />
  <el-alert v-if="errorText" class="mb-3" type="error" :closable="false" :title="errorText" />

  <main>
    <h3 class="flex items-center justify-between gap-2 flex-wrap">
      <span class="flex items-center gap-2">
        <span>图片素材</span>
        <el-tag size="small" :type="total >= LIMIT ? 'danger' : 'info'"
          >{{ total }}/{{ LIMIT }}</el-tag
        >
        <el-select
          v-if="bots.length > 1"
          v-model="endpointId"
          size="small"
          style="width: 190px"
          @change="onBotChange">
          <el-option
            v-for="bot in botOptions"
            :key="bot.value"
            :label="bot.label"
            :value="bot.value" />
        </el-select>
      </span>
      <span class="flex items-center gap-2">
        <el-button size="small" :icon="Refresh" :loading="loading" @click="reload()"
          >刷新</el-button
        >
        <el-upload
          action=""
          accept=".png,.jpg,.jpeg,.gif,.webp"
          :show-file-list="false"
          :before-upload="beforeUpload"
          :disabled="uploadDisabled">
          <el-button
            type="primary"
            size="small"
            :icon="Upload"
            :loading="uploading"
            :disabled="uploadDisabled">
            上传图片
          </el-button>
        </el-upload>
      </span>
    </h3>

    <div v-if="loading" v-loading="true" style="height: 160px"></div>
    <el-empty v-else-if="images.length === 0" description="还没有上传图片" />
    <div v-else class="md-image-grid">
      <el-card
        v-for="item in images"
        :key="item.imageId"
        shadow="never"
        :body-style="{ padding: '8px' }">
        <div class="md-image-thumb">
          <img
            v-if="mediaSrc(item.previewUrl || '')"
            :src="mediaSrc(item.previewUrl || '')"
            :alt="item.fileName"
            loading="lazy"
            @load="onThumbLoad(item, $event)" />
          <el-icon v-else :size="28" class="opacity-40"><Picture /></el-icon>
        </div>
        <div class="text-sm font-medium truncate" :title="item.fileName">
          {{ item.fileName || '未命名图片' }}
        </div>
        <div class="text-[11px] text-gray-400">尺寸 {{ sizeText(item) }}</div>
        <div class="text-[11px] text-gray-400">上传 {{ formatTs(item.createdAt) }}</div>
        <div class="text-[11px] text-gray-400">有效期至 {{ formatTs(item.expiresAt) }}</div>
        <div class="flex items-center gap-1 mt-2">
          <el-button
            size="small"
            link
            type="primary"
            :icon="CopyDocument"
            @click="copyMarkdown(item)">
            复制 Markdown
          </el-button>
          <el-button size="small" link type="danger" :icon="Delete" @click="remove(item)">
            删除
          </el-button>
        </div>
      </el-card>
    </div>

    <div v-if="nextCursor" class="text-center mt-3">
      <el-button size="small" :loading="loadingMore" @click="loadMore">加载更多</el-button>
    </div>
  </main>
</template>

<style scoped>
.helptips {
  background-color: #f3f5f7;
}

.helptips :deep(.el-collapse-item__header) {
  background-color: #f3f5f7;
}

.helptips :deep(.el-collapse-item__wrap) {
  background-color: #f3f5f7;
}

.md-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.md-image-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  margin-bottom: 6px;
  overflow: hidden;
  border-radius: 4px;
  background: #f5f7fa;
}

.md-image-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

@media (max-width: 768px) {
  .md-image-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  .md-image-thumb {
    height: 96px;
  }
}
</style>
