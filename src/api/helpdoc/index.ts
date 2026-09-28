import type { HelpDoc, HelpTextItem, HelpTextItemQuery } from '~/type';
import { createRequest } from '..';
import type { UploadUserFile } from 'element-plus';

const baseUrl = '/helpdoc/';
const request = createRequest(baseUrl);

export function getHelpDocTree() {
  return request<{ result: true; data: HelpDoc[] } | { result: false; err?: string }>(
    'get',
    'tree',
  );
}

export function reloadHelpDoc() {
  return request<{ result: true } | { result: false; err?: string }>('post', 'reload');
}

export function uploadHelpDoc({ files, group }: { files: UploadUserFile[]; group: string }) {
  return request<{ result: true } | { result: false; err?: string }>(
    'post',
    'upload',
    { files: files.map(v => v.raw), group },
    'formdata',
  );
}

export function deleteHelpDoc(keys: string[]) {
  return request<{ result: true } | { result: false; err?: string }>('post', 'delete', { keys });
}

export function getHelpDocPage(param: HelpTextItemQuery) {
  return request<
    { result: true; total: number; data: HelpTextItem[] } | { result: false; err?: string }
  >('post', 'textitem/get_page', param);
}

export interface HelpDocImageRenderConfig {
  /** 总开关：帮助正文命中敏感词、或超过长度阈值时，改发一张现场渲染的图片 */
  imageRenderEnable: boolean;
  /** 正文字符数 ≥ 该值就转图片；0 = 不按长度触发 */
  imageRenderMinLength: number;
  /** 转图片时图片里是否也把敏感词打码（默认 false = 图片里保留原文） */
  imageRenderMaskInImage: boolean;
  /** 自部署渲染后端地址，如 http://127.0.0.1:3212/render */
  imageRenderUrl: string;
  /** 可选令牌，会以 Authorization: Bearer <token> 发送 */
  imageRenderToken: string;
  /** 渲染超时（秒），0 = 后端按 15 秒处理 */
  imageRenderTimeoutSec: number;
  /** 图片宽度（像素），0 = 后端按 820 处理 */
  imageRenderWidth: number;
}

export type HelpDocConfig = {
  aliases: { [key: string]: string[] };
} & Partial<HelpDocImageRenderConfig>;

export function getHelpDocConfig() {
  return request<HelpDocConfig>('get', 'config');
}

export function postHelpDocConfig(param: HelpDocConfig) {
  return request<{ result: true } | { result: false; err?: string }>('post', 'config', param);
}
