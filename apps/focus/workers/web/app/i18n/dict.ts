// Focus-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Focus",
    "focus.title": "Focus",
    "focus.start": "Start session",
    "focus.end": "End session",
    "focus.intent": "What are you working on?",
    "focus.intentPlaceholder": "One thing. Keep it small.",
    "focus.distracted": "I got distracted",
    "focus.history": "History",
    "focus.empty": "No focus sessions yet.",
    "focus.minutes": "{n} min",
    "focus.duration": "Duration",
    "focus.outcome": "Outcome",
    "focus.reflection": "Reflection",
    "focus.elapsed": "Elapsed",
    "focus.inProgress": "In progress",
  },
  ko: {
    "app.name": "집중",
    "focus.title": "집중",
    "focus.start": "세션 시작",
    "focus.end": "세션 종료",
    "focus.intent": "지금 무엇을 하고 있나요?",
    "focus.intentPlaceholder": "한 가지만. 작게 시작하세요.",
    "focus.distracted": "주의가 흐트러졌어요",
    "focus.history": "기록",
    "focus.empty": "아직 집중 세션이 없습니다.",
    "focus.minutes": "{n}분",
    "focus.duration": "시간",
    "focus.outcome": "결과",
    "focus.reflection": "회고",
    "focus.elapsed": "경과",
    "focus.inProgress": "진행 중",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
