// Nudge-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Nudge",
    "nudge.title": "Nudge",
    "nudge.subtitle": "Reminders that show up when you need them.",
    "nudge.new": "+ New",
    "nudge.newTitle": "New reminder",
    "nudge.all": "All reminders",
    "nudge.empty": "No reminders yet.",
    "nudge.textPlaceholder": "Remind me to…",
    "nudge.when": "When",
    "nudge.recurring": "Repeats",
    "nudge.daily": "Daily",
    "nudge.weekly": "Weekly",
    "nudge.once": "Once",
    "nudge.fireAt": "Fires {when}",
    "nudge.nextFire": "Next: {when}",
    "nudge.done": "Done",
  },
  ko: {
    "app.name": "넛지",
    "nudge.title": "넛지",
    "nudge.subtitle": "필요할 때 나타나는 알림.",
    "nudge.new": "+ 새로 만들기",
    "nudge.newTitle": "새 알림",
    "nudge.all": "모든 알림",
    "nudge.empty": "아직 알림이 없습니다.",
    "nudge.textPlaceholder": "이것을 알려주세요…",
    "nudge.when": "시간",
    "nudge.recurring": "반복",
    "nudge.daily": "매일",
    "nudge.weekly": "매주",
    "nudge.once": "한 번",
    "nudge.fireAt": "{when} 발송",
    "nudge.nextFire": "다음: {when}",
    "nudge.done": "완료",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
