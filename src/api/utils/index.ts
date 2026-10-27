import { createRequest } from '..';

const baseUrl = '/utils/';
const request = createRequest(baseUrl);

export function getNewUtils() {
  return request<
    | { result: true; checked: boolean; news: string; newsMark: string }
    | { result: false; err?: string }
  >('get', 'news');
}

export function postUtilsCheckNews(newsMark: string) {
  return request<{ result: true; newsMark: string } | { result: false }>('post', 'check_news', {
    newsMark,
  });
}

export function postUtilsCheckCronExpr(expr: string) {
  return request('post', 'check_cron_expr', { expr });
}

export interface NetworkHealthTarget {
  /** 后端检测目标：qq / kook / discord / telegram / dingtalk / slack（老版本是 seal / sign / google / github） */
  target: string;
  ok: boolean;
  /** 耗时，纳秒（Go time.Duration） */
  duration: number;
}

export function getUtilsCheckNetWorkHealth() {
  return request<
    | {
        result: true;
        total: number;
        ok: string[];
        targets: NetworkHealthTarget[];
        timestamp: number;
      }
    | { result: false }
  >('get', 'check_network_health');
}
