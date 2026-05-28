// Dopamine-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Dopamine",
    "dopamine.title": "Dopamine",
    "dopamine.subtitle": "Track tiny wins. Stack momentum.",
    "dopamine.all": "All wins",
    "dopamine.empty": "No wins logged yet. Log one!",
    "dopamine.logWin": "Log a win",
    "dopamine.placeholder": "What just worked?",
    "dopamine.streak": "{n}-day streak",
    "dopamine.today": "Today",
    "dopamine.thisWeek": "This week",
    "dopamine.delete": "Delete",
    "dopamine.savedAt": "{when}",
  },
  ko: {
    "app.name": "도파민",
    "dopamine.title": "도파민",
    "dopamine.subtitle": "작은 성공을 기록하고 흐름을 쌓아요.",
    "dopamine.all": "모든 성공",
    "dopamine.empty": "아직 기록이 없습니다. 하나 기록해보세요!",
    "dopamine.logWin": "성공 기록",
    "dopamine.placeholder": "무엇이 잘됐나요?",
    "dopamine.streak": "{n}일 연속",
    "dopamine.today": "오늘",
    "dopamine.thisWeek": "이번 주",
    "dopamine.delete": "삭제",
    "dopamine.savedAt": "{when}",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
