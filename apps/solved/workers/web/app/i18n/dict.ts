// Solved-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Solved",
    "solved.title": "Solved",
    "solved.subtitle": "Your personal knowledge base of things you fixed.",
    "solved.new": "+ New entry",
    "solved.newTitle": "New entry",
    "solved.searchPlaceholder": "Search problems and solutions…",
    "solved.empty": "No entries yet.",
    "solved.problem": "Problem",
    "solved.solution": "Solution",
    "solved.problemPlaceholder": "What was broken?",
    "solved.solutionPlaceholder": "How did you fix it?",
    "solved.tagsPlaceholder": "Tags (comma-separated)",
    "solved.notFound": "Entry not found",
    "solved.backToList": "Back to your knowledge base",
    "solved.savedAt": "Saved {when}",
  },
  ko: {
    "app.name": "해결됨",
    "solved.title": "해결됨",
    "solved.subtitle": "고친 것들의 개인 지식 베이스.",
    "solved.new": "+ 새 항목",
    "solved.newTitle": "새 항목",
    "solved.searchPlaceholder": "문제와 해결책 검색…",
    "solved.empty": "아직 항목이 없습니다.",
    "solved.problem": "문제",
    "solved.solution": "해결책",
    "solved.problemPlaceholder": "무엇이 망가졌나요?",
    "solved.solutionPlaceholder": "어떻게 고쳤나요?",
    "solved.tagsPlaceholder": "태그 (쉼표로 구분)",
    "solved.notFound": "항목을 찾을 수 없음",
    "solved.backToList": "지식 베이스로 돌아가기",
    "solved.savedAt": "{when} 저장",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
