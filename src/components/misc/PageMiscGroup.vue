<template>
  <h2>群管理</h2>
  <div style="display: flex">
    <span style="margin-right: 1rem; white-space: nowrap">平台：</span>
    <span style="margin-right: -0.2rem">
      <el-checkbox-group v-model="checkList">
        <el-checkbox label="QQ-Group:">QQ 群</el-checkbox>
        <el-checkbox label="OpenQQ-Group:">QQ 官方机器人群</el-checkbox>
        <el-checkbox label="QQ-CH-Group:">QQ 频道</el-checkbox>
        <el-checkbox label="OpenQQCH-Channel:">QQ 官方机器人频道</el-checkbox>
        <el-checkbox label="DISCORD-CH-Group:">Discord 频道</el-checkbox>
        <el-checkbox label="DODO-Group:">Dodo 频道</el-checkbox>
        <el-checkbox label="KOOK-CH-Group:">KOOK 频道</el-checkbox>
        <el-checkbox label="DINGTALK-Group:">钉钉群</el-checkbox>
        <el-checkbox label="SLACK-CH-Group:">Slack 频道</el-checkbox>
        <el-checkbox label="TG-Group:">TG 群</el-checkbox>
        <el-checkbox label="SEALCHAT-Group:">Sealchat 频道</el-checkbox>
      </el-checkbox-group>
    </span>
  </div>
  <div>
    <span style="margin-right: 1rem">其他：</span>
    <el-checkbox v-model="orderByTimeDesc">按最后使用时间降序</el-checkbox>
    <el-checkbox v-model="filter30daysUnused">30 天未使用</el-checkbox>
  </div>
  <div>
    <span style="margin-right: 1rem">搜索：</span>
    <el-input
      v-model="searchBy"
      style="max-width: 15rem"
      placeholder="请输入帐号或群名的一部分"></el-input>
  </div>

  <div style="margin-top: 2rem">
    <div v-bind="containerProps" style="height: calc(100vh - 22.5rem)">
      <div v-bind="wrapperProps">
        <div v-for="item in list" :key="item.index" style="">
          <foldable-card style="margin-top: 1rem">
            <template #title>
              <el-space class="item-header" size="large" alignment="center">
                <el-switch
                  v-model="item.data.active"
                  style="
                    --el-switch-on-color: var(--el-color-success);
                    --el-switch-off-color: var(--el-color-danger);
                  "
                  @click="item.data.changed = true" />
                <el-space size="small" wrap>
                  <el-tooltip
                    :content="item.data.groupId"
                    placement="top"
                    trigger="click"
                    :show-after="100">
                    <el-text
                      style="
                        max-width: 23rem;
                        overflow: hidden;
                        white-space: nowrap;
                        text-overflow: ellipsis;
                      "
                      size="large"
                      tag="strong"
                      >{{ item.data.groupId }}</el-text
                    >
                  </el-tooltip>
                  <el-text>「{{ groupDisplayName(item.data) }}」</el-text>
                  <el-tag
                    v-if="isGroupBanned(item.data.groupId)"
                    type="danger"
                    size="small"
                    disable-transitions
                    >已拉黑</el-tag
                  >
                  <el-tag v-else-if="groupBanTag(item.data.groupId)" type="warning" size="small" disable-transitions
                    >{{ groupBanTag(item.data.groupId) }}</el-tag
                  >
                </el-space>
              </el-space>
            </template>

            <template #title-extra>
              <el-button
                v-if="item.data.changed"
                type="success"
                size="small"
                :icon="DocumentChecked"
                plain
                @click="saveOne(item.data, item.index)"
                >保存</el-button
              >
              <el-tooltip
                :content="
                  isGroupBanned(item.data.groupId)
                    ? '从黑名单移除，机器人恢复响应这个群'
                    : '把群加入黑名单，机器人不再响应这个群的任何消息'
                "
                placement="top">
                <el-button
                  :type="isGroupBanned(item.data.groupId) ? 'warning' : 'danger'"
                  size="small"
                  :icon="isGroupBanned(item.data.groupId) ? CircleCheck : CircleClose"
                  plain
                  :loading="banBusy[item.data.groupId]"
                  @click="toggleGroupBan(item.data)"
                  >{{ isGroupBanned(item.data.groupId) ? '解除拉黑' : '拉黑' }}</el-button
                >
              </el-tooltip>
              <template v-if="item.data.groupId.startsWith('QQ-Group:')">
                <el-tooltip
                  v-for="(_, j) in item.data.diceIdExistsMap"
                  :key="j"
                  raw-content
                  :content="j.toString() + '<br>有二次确认'">
                  <el-button
                    type="danger"
                    size="small"
                    :icon="Close"
                    plain
                    @click="quitGroup(item.data, item.index, j.toString())"
                    >退出 {{ j.toString().slice(-4) }}</el-button
                  >
                </el-tooltip>
              </template>
            </template>

            <el-descriptions>
              <el-descriptions-item label="上次使用">{{
                item.data.recentDiceSendTime
                  ? dayjs.unix(item.data.recentDiceSendTime).fromNow()
                  : '从未'
              }}</el-descriptions-item>
              <el-descriptions-item label="入群时间">{{
                item.data.enteredTime ? dayjs.unix(item.data.enteredTime).fromNow() : '未知'
              }}</el-descriptions-item>
              <el-descriptions-item label="邀请人">{{
                item.data.inviteUserId || '未知'
              }}</el-descriptions-item>
              <el-descriptions-item label="Log状态">{{
                item.data.logOn ? '开启' : '关闭'
              }}</el-descriptions-item>
              <el-descriptions-item label="迎新">{{
                item.data.showGroupWelcome ? '开启' : '关闭'
              }}</el-descriptions-item>
              <el-descriptions-item />
              <el-descriptions-item :span="3" label="启用扩展">
                <span v-if="item.data.tmpExtList">
                  <el-tag
                    :key="group"
                    v-for="group of item.data.tmpExtList"
                    size="small"
                    style="margin-right: 0.5rem"
                    disable-transitions
                    >{{ group }}</el-tag
                  >
                </span>
                <el-text v-else>'未知'</el-text>
              </el-descriptions-item>
            </el-descriptions>

            <template #unfolded-extra>
              <el-descriptions>
                <el-descriptions-item :span="2" label="上次使用"
                  >{{
                    item.data.recentDiceSendTime
                      ? dayjs.unix(item.data.recentDiceSendTime).fromNow()
                      : '从未'
                  }}
                </el-descriptions-item>
                <el-descriptions-item label="邀请人">{{
                  item.data.inviteUserId || '未知'
                }}</el-descriptions-item>
              </el-descriptions>
              <el-descriptions
                v-if="
                  item.data.tmpFingerMemo ||
                  item.data.tmpClassText ||
                  (item.data.tmpGroupTags && item.data.tmpGroupTags.length)
                ">
                <el-descriptions-item v-if="item.data.tmpClassText" label="群分类">{{
                  item.data.tmpClassText
                }}</el-descriptions-item>
                <el-descriptions-item
                  v-if="item.data.tmpGroupTags && item.data.tmpGroupTags.length"
                  :span="2"
                  label="群标签">
                  <el-tag
                    v-for="tag of item.data.tmpGroupTags"
                    :key="tag"
                    size="small"
                    style="margin-right: 0.5rem"
                    disable-transitions
                    >{{ tag }}</el-tag
                  >
                </el-descriptions-item>
                <el-descriptions-item v-if="item.data.tmpFingerMemo" :span="3" label="群简介">
                  <span style="white-space: pre-wrap">{{ item.data.tmpFingerMemo }}</span>
                </el-descriptions-item>
              </el-descriptions>
            </template>
          </foldable-card>
        </div>
      </div>
    </div>

    <!-- <el-card shadow="hover" v-for="(i, index) in groupItems" style="margin-top: 1rem;">
      <template #header>
        <div class="item-header">
          <el-space size="large" alignment="center">
            <el-switch v-model="i.active" @click="i.changed = true"
              style="--el-switch-on-color: var(--el-color-success); --el-switch-off-color: var(--el-color-danger)" />
            <el-space size="small" wrap>
              <el-text size="large" tag="strong">{{ i.groupId }}</el-text>
              <el-text>「{{ i.groupName || '未获取到' }}」</el-text>
            </el-space>
          </el-space>
          <el-space>
            <el-button type="success" size="small" :icon="DocumentChecked" plain v-if="i.changed"
              @click="saveOne(i, index)">保存</el-button>
            <el-tooltip v-for="_, j in i.diceIdExistsMap" raw-content :content="j.toString() + '<br>有二次确认'">
              <el-button type="danger" size="small" :icon="Close" plain @click="quitGroup(i, index, j.toString())">退出
                {{ j.toString().slice(-4) }}</el-button>
            </el-tooltip>
          </el-space>
        </div>
      </template>
      <el-descriptions>
        <el-descriptions-item label="上次使用">{{ i.recentDiceSendTime ? dayjs.unix(i.recentDiceSendTime).fromNow() : '从未'
        }}</el-descriptions-item>
        <el-descriptions-item label="入群时间">{{ i.enteredTime ? dayjs.unix(i.enteredTime).fromNow() : '未知'
        }}</el-descriptions-item>
        <el-descriptions-item label="邀请人">{{ i.inviteUserId || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="Log 状态">{{ i.logOn ? '开启' : '关闭' }}</el-descriptions-item>
        <el-descriptions-item label="迎新">{{ i.showGroupWelcome ? '开启' : '关闭' }}</el-descriptions-item>
        <el-descriptions-item />
        <el-descriptions-item :span="3" label="启用扩展">
          <span v-if="i.tmpExtList">
            <el-tag size="small" v-for="group of i.tmpExtList" style="margin-right: 0.5rem;" disable-transitions>{{ group
            }}</el-tag>
          </span>
          <el-text v-else>'未知'</el-text>
        </el-descriptions-item>
      </el-descriptions>
    </el-card> -->
  </div>
</template>

<script lang="ts" setup>
import { CircleCheck, CircleClose, Close, DocumentChecked } from '@element-plus/icons-vue';
import * as dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { now, sortBy } from 'lodash-es';
import { getBanConfigList, postMapAddOne, postMapDelOne } from '~/api/banconfig';
import { getGroupList, postQuitGroup, setGroup } from '~/api/group';

dayjs.extend(relativeTime);

const checkList = ref<string[]>(['QQ-Group:']);

const groupList = ref<any>({});

const orderByTimeDesc = ref(true);
const filter30daysUnused = ref(false);
const searchBy = ref('');

/** 黑白名单里和群相关的条目，key 为群 ID（如 QQ-Group:123 / OpenQQ-Group:xxx-yyy）。 */
const banMap = ref<Record<string, any>>({});
const banBusy = ref<Record<string, boolean>>({});

const BAN_RANK_BANNED = -30;

const findBanItem = (groupId: string) => banMap.value[groupId];

function isGroupBanned(groupId: string) {
  return findBanItem(groupId)?.rank === BAN_RANK_BANNED;
}

/** 名单等级文案（后端只给数字 rank，没有文案字段） */
function banRankText(rank: number) {
  switch (rank) {
    case 30:
      return '信任';
    case -30:
      return '禁止';
    case -10:
      return '警告';
    default:
      return '';
  }
}

function groupBanTag(groupId: string) {
  const item = findBanItem(groupId);
  return item ? banRankText(item.rank) : '';
}

async function loadBanList() {
  try {
    const list = await getBanConfigList();
    const m: Record<string, any> = {};
    for (const it of (list as any[]) || []) {
      if (it?.ID) m[it.ID] = it;
    }
    banMap.value = m;
  } catch {
    // 名单拉不到不影响群列表本身
  }
}

/** 快捷拉黑 / 解除拉黑：黑名单里的群机器人不会再响应。 */
async function toggleGroupBan(data: any) {
  const groupId: string = data?.groupId;
  if (!groupId) return;
  const banned = isGroupBanned(groupId);
  const name = groupDisplayName(data);
  try {
    await ElMessageBox.confirm(
      banned
        ? `解除对群「${name}」的拉黑？解除后机器人会重新响应这个群。`
        : `把群「${name}」拉入黑名单？拉黑后机器人不再响应这个群的任何消息。`,
      banned ? '解除拉黑' : '拉黑该群',
      {
        confirmButtonText: banned ? '解除' : '拉黑',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  banBusy.value[groupId] = true;
  try {
    let res: any;
    if (banned) {
      res = await postMapDelOne({ ID: groupId, name, rank: BAN_RANK_BANNED, reason: '' } as any);
    } else {
      res = await postMapAddOne(groupId, BAN_RANK_BANNED, name === '未获取到' ? '' : name, '骰主后台设置');
    }
    // 不轻信 200：展示模式 / 没有可用账号时后端只是没做事，重新拉名单确认
    await loadBanList();
    const applied = banned ? !isGroupBanned(groupId) : isGroupBanned(groupId);
    if (applied) {
      ElMessage.success(banned ? '已解除拉黑' : '已拉黑');
    } else if (res?.testMode) {
      ElMessage.warning('展示模式不支持修改黑白名单');
    } else {
      ElMessage.warning('名单没有变化，请到「拦截管理」里确认一下');
    }
  } catch (e: any) {
    ElMessage.error(`操作失败：${e?.message || e}`);
  } finally {
    banBusy.value[groupId] = false;
  }
}

/**
 * 群名显示：官方 QQ 群的群名要另外走 /v2/groups/{id}/info，
 * 拉不到时至少显示 openid 后缀，不要只写「未获取到」。
 */
function groupDisplayName(data: any) {
  if (data?.groupName) return data.groupName;
  const matched = String(data?.groupId || '').match(/^OpenQQ-Group:[^-]+-(.+)$/);
  if (matched) return '官方群 · ' + matched[1].slice(-6);
  return '未获取到';
}

const groupItems = computed<any[]>(() => {
  if (groupList.value.items) {
    // const groupListItems = cloneDeep(groupList.value.items)
    let items = [];
    for (const i of groupList.value.items) {
      let ok = false;
      for (const f of checkList.value) {
        if (i.groupId.startsWith(f)) {
          ok = true;
        }
      }

      if (ok && searchBy.value !== '') {
        let a = false;
        let b = false;
        if (i.groupId.indexOf(searchBy.value) !== -1) {
          a = true;
        }
        if (i.groupName.indexOf(searchBy.value) !== -1) {
          b = true;
        }
        ok = a || b;
      }

      if (ok) {
        const t = Math.max(i.enteredTime || 0, i.recentCommandTime || 0, i.recentDiceSendTime || 0);
        if (filter30daysUnused.value) {
          if (now() / 1000 - t < 30 * 24 * 60 * 60) {
            ok = false;
          }
        }
      }

      if (ok) items.push(i);
    }

    items = sortBy(items, ['recentCommandTime']);
    if (orderByTimeDesc.value) {
      items = items.reverse();
    }
    return items;
  }
  return [];
});

const refreshList = async () => {
  const data = await getGroupList();
  groupList.value = data;
};

const { list, containerProps, wrapperProps } = useVirtualList(groupItems, {
  itemHeight: 230,
});

const quitTextSave = ref(false);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const saveOne = async (i: any, index: number) => {
  // await store.backupConfigSave(cfg.value)
  // console.log(222, i, index)
  await setGroup(i);
  i.changed = false;
  ElMessage.success('已保存');
};

const quitGroup = async (i: any, index: number, diceId: string) => {
  const quitGroupText =
    localStorage.getItem('quitGroupText') || '因长期不使用等原因，骰主后台操作退出';
  ElMessageBox.prompt(
    '会进行退出留言“因长期不使用等原因，骰主后台操作退出”，输入英文大写 NO 则静默退出，写别的则为附加留言',
    '退出此群？',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      inputValue: quitGroupText,
      message: h('div', null, [
        h(
          'p',
          null,
          '会进行退出留言“因长期不使用等原因，骰主后台操作退出”，输入英文大写 NO 则静默退出，写别的则为附加留言',
        ),
        h(
          'label',
          {
            onInput: (e: any) => {
              quitTextSave.value = e.target.checked;
            },
          },
          [
            h('input', {
              value: quitTextSave.value,
              type: 'checkbox',
            }),
            h('span', null, '设为默认'),
          ],
        ),
      ]),
    },
  ).then(async data => {
    await postQuitGroup({
      groupId: i.groupId,
      diceId,
      silence: data.value === 'NO',
      extraText: data.value,
    });
    if (quitTextSave.value) {
      localStorage.setItem('quitGroupText', data.value);
    }

    await refreshList();
    ElMessage.success('退出完成');

    ElMessage({
      type: 'success',
      message: '成功！',
    });
  });
};

onBeforeMount(async () => {
  await Promise.all([refreshList(), loadBanList()]);
});
</script>

<style lang="css">
span.left {
  display: inline-block;
  min-width: 5rem;
}

@media screen and (max-width: 700px) {
  .bak-item {
    flex-direction: column;

    & > span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}

.item-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}
</style>
