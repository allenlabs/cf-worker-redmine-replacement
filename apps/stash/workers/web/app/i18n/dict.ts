// Stash-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Stash",
    "stash.title": "Stash",
    "stash.searchPlaceholder": "Search (press /)",
    "stash.search": "Search snippets",
    "stash.new": "+ New",
    "stash.newTitle": "New snippet",
    "stash.titlePlaceholder": "Title",
    "stash.bodyPlaceholder": "Body — Markdown is fine.",
    "stash.tagsPlaceholder": "Tags (comma-separated)",
    "stash.empty": "No snippets yet.",
    "stash.notFound": "Snippet not found",
    "stash.backToList": "Back to your stash",
    "stash.copyBody": "Copy body",
    "stash.lastEdited": "Edited {when}",
  },
  ko: {
    "app.name": "스태시",
    "stash.title": "스태시",
    "stash.searchPlaceholder": "검색 (/ 누르기)",
    "stash.search": "스니펫 검색",
    "stash.new": "+ 새로 만들기",
    "stash.newTitle": "새 스니펫",
    "stash.titlePlaceholder": "제목",
    "stash.bodyPlaceholder": "본문 — 마크다운 가능합니다.",
    "stash.tagsPlaceholder": "태그 (쉼표로 구분)",
    "stash.empty": "아직 스니펫이 없습니다.",
    "stash.notFound": "스니펫을 찾을 수 없음",
    "stash.backToList": "스태시로 돌아가기",
    "stash.copyBody": "본문 복사",
    "stash.lastEdited": "{when} 수정",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
