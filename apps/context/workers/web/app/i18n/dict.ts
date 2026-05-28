// Context-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Context",
    "context.title": "Context",
    "context.subtitle": "Snapshot your working context, restore anywhere.",
    "context.save": "Save snapshot",
    "context.restore": "Restore",
    "context.empty": "No snapshots yet.",
    "context.name": "Name",
    "context.body": "Body",
    "context.tags": "Tags",
    "context.placeholder": "What were you doing?",
    "context.savedAt": "Saved {when}",
    "context.copyToClipboard": "Copy to clipboard",
    "context.snapshotNotFound": "Snapshot not found",
    "context.backToList": "Back to your snapshots",
  },
  ko: {
    "app.name": "컨텍스트",
    "context.title": "컨텍스트",
    "context.subtitle": "작업 상태를 저장하고 어디서든 복원.",
    "context.save": "스냅샷 저장",
    "context.restore": "복원",
    "context.empty": "아직 스냅샷이 없습니다.",
    "context.name": "이름",
    "context.body": "내용",
    "context.tags": "태그",
    "context.placeholder": "무엇을 하고 있었나요?",
    "context.savedAt": "{when} 저장",
    "context.copyToClipboard": "클립보드에 복사",
    "context.snapshotNotFound": "스냅샷을 찾을 수 없음",
    "context.backToList": "스냅샷 목록으로",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
