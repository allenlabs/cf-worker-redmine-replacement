// Today-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Today",
    "today.title": "Today",
    "today.subtitle": "Your single screen for next action.",
    "today.empty": "Nothing for today.",
    "today.add": "Add to today",
    "today.placeholder": "What's the one thing for today?",
    "today.commit": "Commit",
    "today.done": "Done",
    "today.skip": "Skip",
    "today.tomorrow": "Tomorrow",
    "today.now": "Now",
    "today.next": "Next",
    "today.from.inbox": "From inbox",
    "today.from.focus": "From focus",
  },
  ko: {
    "app.name": "오늘",
    "today.title": "오늘",
    "today.subtitle": "다음 행동을 위한 단일 화면.",
    "today.empty": "오늘 할 일이 없습니다.",
    "today.add": "오늘에 추가",
    "today.placeholder": "오늘 할 한 가지는 무엇인가요?",
    "today.commit": "약속",
    "today.done": "완료",
    "today.skip": "건너뛰기",
    "today.tomorrow": "내일",
    "today.now": "지금",
    "today.next": "다음",
    "today.from.inbox": "수신함에서",
    "today.from.focus": "집중에서",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
