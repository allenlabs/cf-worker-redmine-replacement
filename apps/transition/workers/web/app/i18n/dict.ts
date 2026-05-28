// Transition-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Transition",
    "transition.title": "Transition",
    "transition.subtitle": "Rituals to soften task-switching.",
    "transition.new": "+ New ritual",
    "transition.newTitle": "New ritual",
    "transition.empty": "No rituals yet.",
    "transition.fromPlaceholder": "From (e.g. deep work)",
    "transition.toPlaceholder": "To (e.g. meeting)",
    "transition.stepsPlaceholder": "Steps, one per line",
    "transition.run": "Run ritual",
    "transition.complete": "Complete",
    "transition.from": "From",
    "transition.to": "To",
    "transition.steps": "Steps",
    "transition.lastRun": "Last run {when}",
  },
  ko: {
    "app.name": "전환",
    "transition.title": "전환",
    "transition.subtitle": "작업 전환을 부드럽게 만드는 의식.",
    "transition.new": "+ 새 의식",
    "transition.newTitle": "새 의식",
    "transition.empty": "아직 의식이 없습니다.",
    "transition.fromPlaceholder": "이전 (예: 깊은 작업)",
    "transition.toPlaceholder": "이후 (예: 회의)",
    "transition.stepsPlaceholder": "단계, 한 줄에 하나",
    "transition.run": "의식 실행",
    "transition.complete": "완료",
    "transition.from": "이전",
    "transition.to": "이후",
    "transition.steps": "단계",
    "transition.lastRun": "마지막 실행 {when}",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
