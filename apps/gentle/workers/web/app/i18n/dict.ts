// Gentle-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Gentle",
    "gentle.title": "Gentle",
    "gentle.subtitle": "A soft daily check-in. No streaks. No guilt.",
    "gentle.checkin": "Check in",
    "gentle.sleep": "Sleep",
    "gentle.water": "Water",
    "gentle.energy": "Energy",
    "gentle.notes": "Notes",
    "gentle.notesPlaceholder": "Just one line.",
    "gentle.history": "History",
    "gentle.empty": "No check-ins yet.",
    "gentle.heatmap": "Heatmap",
    "gentle.today": "Today",
    "gentle.savedFor": "Saved for {date}",
    "gentle.back": "back to today",
  },
  ko: {
    "app.name": "젠틀",
    "gentle.title": "젠틀",
    "gentle.subtitle": "부드러운 일일 체크인. 연속 기록도, 죄책감도 없어요.",
    "gentle.checkin": "체크인",
    "gentle.sleep": "수면",
    "gentle.water": "수분",
    "gentle.energy": "에너지",
    "gentle.notes": "메모",
    "gentle.notesPlaceholder": "한 줄만.",
    "gentle.history": "기록",
    "gentle.empty": "아직 체크인이 없습니다.",
    "gentle.heatmap": "히트맵",
    "gentle.today": "오늘",
    "gentle.savedFor": "{date} 기록됨",
    "gentle.back": "오늘로 돌아가기",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
