// Inbox-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Inbox",
    "inbox.title": "Inbox",
    "inbox.placeholder": "Type a thought, hit ↵ — that's it.",
    "inbox.capture": "Capture",
    "inbox.zero": "Inbox zero.",
    "inbox.zeroHint": "Working memory: clear.  Go ship the thing.",
    "inbox.snoozed": "Snoozed ({n})",
    "inbox.triageLabel": "Triage list",
    "inbox.keysHint":
      "Keys: j/k move · ↵ open · 1 pin · 2 refile→PM · d drop · s snooze 1d · S snooze 1w · u mark unread",
    "inbox.via": "via {source}",
    "inbox.wakes": "wakes {when}",
  },
  ko: {
    "app.name": "수신함",
    "inbox.title": "수신함",
    "inbox.placeholder": "생각을 입력하고 ↵ — 그게 전부에요.",
    "inbox.capture": "담기",
    "inbox.zero": "수신함 비움.",
    "inbox.zeroHint": "작업 기억: 정리됨. 이제 만들러 가세요.",
    "inbox.snoozed": "보류 ({n})",
    "inbox.triageLabel": "분류 목록",
    "inbox.keysHint":
      "단축키: j/k 이동 · ↵ 열기 · 1 고정 · 2 PM으로 보내기 · d 버리기 · s 1일 보류 · S 1주 보류 · u 안읽음 표시",
    "inbox.via": "출처 {source}",
    "inbox.wakes": "{when} 깨어남",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
