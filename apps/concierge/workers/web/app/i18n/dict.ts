// Concierge-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Concierge",
    "concierge.title": "Concierge",
    "concierge.subtitle": "Cross-app nudges, when you actually need them.",
    "concierge.empty": "No nudges right now.",
    "concierge.preferences": "Preferences",
    "concierge.trigger": "Run now",
    "concierge.quietHours": "Quiet hours",
    "concierge.muteFor": "Mute for {hours}h",
    "concierge.from": "from {app}",
    "concierge.dismiss": "Dismiss",
    "concierge.act": "Act",
    "concierge.snooze": "Snooze",
    "concierge.history": "History",
  },
  ko: {
    "app.name": "콘시어지",
    "concierge.title": "콘시어지",
    "concierge.subtitle": "정말 필요할 때 오는 앱 간 알림.",
    "concierge.empty": "현재 알림 없음.",
    "concierge.preferences": "설정",
    "concierge.trigger": "지금 실행",
    "concierge.quietHours": "방해 금지 시간",
    "concierge.muteFor": "{hours}시간 음소거",
    "concierge.from": "{app}에서",
    "concierge.dismiss": "닫기",
    "concierge.act": "실행",
    "concierge.snooze": "보류",
    "concierge.history": "기록",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
