// Read-later-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Read Later",
    "rl.title": "Read Later",
    "rl.queue": "Queue",
    "rl.saved": "Saved",
    "rl.empty": "Nothing in your queue.",
    "rl.savePlaceholder": "Paste a URL…",
    "rl.save": "Save",
    "rl.markRead": "Mark as read",
    "rl.archive": "Archive",
    "rl.openOriginal": "Open original",
    "rl.tagsPlaceholder": "Tags (comma-separated)",
    "rl.estimatedReadTime": "~{n} min read",
    "rl.savedAt": "Saved {when}",
    "rl.readingNow": "Reading now",
  },
  ko: {
    "app.name": "나중에 읽기",
    "rl.title": "나중에 읽기",
    "rl.queue": "대기열",
    "rl.saved": "저장됨",
    "rl.empty": "대기열이 비어있습니다.",
    "rl.savePlaceholder": "URL 붙여넣기…",
    "rl.save": "저장",
    "rl.markRead": "읽음 표시",
    "rl.archive": "보관",
    "rl.openOriginal": "원본 열기",
    "rl.tagsPlaceholder": "태그 (쉼표로 구분)",
    "rl.estimatedReadTime": "약 {n}분 읽기",
    "rl.savedAt": "{when} 저장",
    "rl.readingNow": "지금 읽는 중",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
