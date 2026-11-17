import { createRequest } from '..';

const request = createRequest('/official-qq/media-images');

/** 可管理素材的官方 QQ 机器人（对应一个 endpoint） */
export interface OfficialQQMediaBot {
  id: string;
  name: string;
  appId: string;
}

/** 一张已上传的 Markdown 图片素材。width/height 是后端上传时补记的，可能缺失 */
export interface OfficialQQMediaImage {
  imageId: string;
  /** qqbot-media://image/v1/<token> */
  url: string;
  fileName: string;
  width?: number;
  height?: number;
  createdAt?: number;
  expiresAt?: number;
  /** 平台给的短时效预览地址，只用于展示，不要持久化 */
  previewUrl?: string;
}

export interface OfficialQQMediaList {
  bots: OfficialQQMediaBot[];
  endpointId: string;
  images: OfficialQQMediaImage[];
  total: number;
  nextCursor?: string;
}

type FailResponse = { result: false; err?: string };
type OkResponse<T> = { result: true } & T;

/** 查询当前机器人的有效图片（游标分页） */
export async function getMediaImages(params: { endpointId?: string; cursor?: string } = {}) {
  return await request<FailResponse | OkResponse<Partial<OfficialQQMediaList>>>('get', '', params);
}

/** 上传一张 Markdown 图片素材（后端完成 prepare → PUT → complete） */
export async function postMediaImage(endpointId: string, file: File) {
  return await request<
    FailResponse | OkResponse<{ image?: OfficialQQMediaImage; endpointId?: string }>
  >('post', '', { endpointId, file }, 'formdata', { timeout: 120000 });
}

/** 删除图片，释放配额 */
export async function deleteMediaImage(endpointId: string, imageId: string) {
  return await request<FailResponse | OkResponse<Record<string, never>>>(
    'delete',
    '/' + encodeURIComponent(imageId),
    undefined,
    undefined,
    { params: { endpointId } },
  );
}
