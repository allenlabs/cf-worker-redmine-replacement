// Journal-specific strings merged with the shared common dict.
import { mergeDicts, type Dict } from "@allenlabs/i18n";
import { commonStrings } from "@allenlabs/i18n/dict/common";

const app: Dict = {
  en: {
    "app.name": "Journal",
    "journal.title": "Journal",
    "journal.subtitle": "Daily check-in: how was your brain today?",
    "journal.history": "History",
    "journal.checkin": "Check in",
    "journal.energy": "Energy",
    "journal.mood": "Mood",
    "journal.focus": "Focus",
    "journal.notes": "Notes",
    "journal.notesPlaceholder": "Anything else worth remembering?",
    "journal.empty": "No entries yet.",
    "journal.heatmap": "Heatmap",
    "journal.savedFor": "Saved for {date}",
    "journal.todayLabel": "Today",
    "journal.yesterdayLabel": "Yesterday",
  },
  ko: {
    "app.name": "저널",
    "journal.title": "저널",
    "journal.subtitle": "오늘 컨디션은 어땠나요?",
    "journal.history": "기록",
    "journal.checkin": "기록하기",
    "journal.energy": "에너지",
    "journal.mood": "기분",
    "journal.focus": "집중도",
    "journal.notes": "메모",
    "journal.notesPlaceholder": "기억할 만한 게 또 있나요?",
    "journal.empty": "아직 기록이 없습니다.",
    "journal.heatmap": "히트맵",
    "journal.savedFor": "{date} 기록됨",
    "journal.todayLabel": "오늘",
    "journal.yesterdayLabel": "어제",
  },
};

export const appDict: Dict = mergeDicts(commonStrings, app);
