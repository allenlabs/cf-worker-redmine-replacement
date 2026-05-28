// Intent-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Intent",
    "intent.title": "Intent",
    "intent.subtitle": "What are you doing right now?",
    "intent.placeholder": "One line. Keep it sharp.",
    "intent.set": "Set intent",
    "intent.clear": "Clear",
    "intent.current": "Current intent",
    "intent.lastSet": "Set {when}",
    "intent.empty": "No intent set.",
    "intent.history": "Past intents",
    "intent.commitFor": "Commit for…",
    "intent.minutes30": "30 minutes",
    "intent.hour1": "1 hour",
    "intent.hours2": "2 hours",
  },
  ko: {
    "app.name": "의도",
    "intent.title": "의도",
    "intent.subtitle": "지금 무엇을 하고 있나요?",
    "intent.placeholder": "한 줄로. 명확하게.",
    "intent.set": "의도 설정",
    "intent.clear": "지우기",
    "intent.current": "현재 의도",
    "intent.lastSet": "{when} 설정",
    "intent.empty": "설정된 의도가 없습니다.",
    "intent.history": "지난 의도",
    "intent.commitFor": "약속할 시간…",
    "intent.minutes30": "30분",
    "intent.hour1": "1시간",
    "intent.hours2": "2시간",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
