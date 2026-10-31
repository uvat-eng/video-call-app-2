export type Contact = {
  id: string;
  name: string;
  initials: string;
  tone: "a" | "b";
  online: boolean;
  phone: string;
  status: string;
  lastSeen: string;
};

export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  read?: boolean;
  author?: string;
};

export type Chat = {
  id: string;
  contactId: string;
  title?: string;
  isGroup?: boolean;
  unread: number;
  preview: string;
  time: string;
  messages: Message[];
  scheduled?: { time: string; kind: "video" | "audio" };
};

export type CallKind = "video" | "audio";
export type CallDirection = "in" | "out" | "missed";

export type CallRecord = {
  id: string;
  contactId: string;
  kind: CallKind;
  direction: CallDirection;
  when: string;
  duration: string;
};

export const CONTACTS: Contact[] = [
  { id: "mk", name: "Марина Ковалёва", initials: "МК", tone: "a", online: true, phone: "+7 916 204-18-33", status: "Фотографирую города", lastSeen: "в сети" },
  { id: "dp", name: "Дима Петров", initials: "ДП", tone: "b", online: true, phone: "+7 925 771-40-12", status: "На созвонах до 18:00", lastSeen: "в сети" },
  { id: "fam", name: "Семья", initials: "С", tone: "a", online: false, phone: "4 участника", status: "Мама, папа, Лена, вы", lastSeen: "Мама была в сети 16:05" },
  { id: "al", name: "Аня Лебедева", initials: "АЛ", tone: "b", online: false, phone: "+7 903 118-62-90", status: "Лучше голосовым", lastSeen: "была вчера в 22:14" },
  { id: "rb", name: "Работа · Бэкенд", initials: "РБ", tone: "b", online: false, phone: "7 участников", status: "Релизы по пятницам", lastSeen: "Игорь был в сети вчера" },
  { id: "os", name: "Олег Смирнов", initials: "ОС", tone: "a", online: false, phone: "+7 977 540-03-71", status: "Не беспокоить", lastSeen: "был в понедельник" },
  { id: "ek", name: "Екатерина Волкова", initials: "ЕВ", tone: "a", online: true, phone: "+7 912 330-55-08", status: "Дизайн и кофе", lastSeen: "в сети" },
  { id: "is", name: "Игорь Соколов", initials: "ИС", tone: "b", online: false, phone: "+7 926 845-21-60", status: "Тимлид бэкенда", lastSeen: "был вчера в 21:40" },
];

export const INITIAL_CHATS: Chat[] = [
  {
    id: "c-mk",
    contactId: "mk",
    unread: 2,
    preview: "Созвонимся в 19:00?",
    time: "18:42",
    scheduled: { time: "19:00", kind: "video" },
    messages: [
      { id: "m1", from: "them", text: "Привет! Посмотрела квартиру — сняла видео", time: "18:31" },
      { id: "m2", from: "me", text: "Давай лучше покажешь вживую по видео", time: "18:35", read: true },
      { id: "m3", from: "them", text: "Созвонимся в 19:00?", time: "18:42" },
    ],
  },
  {
    id: "c-dp",
    contactId: "dp",
    unread: 0,
    preview: "Видеозвонок · 12 мин",
    time: "17:10",
    messages: [
      { id: "d1", from: "me", text: "Скинь, пожалуйста, ссылку на макет", time: "16:52", read: true },
      { id: "d2", from: "them", text: "Сейчас наберу, проще показать", time: "16:57" },
      { id: "d3", from: "them", text: "Видеозвонок · 12 мин", time: "17:10" },
    ],
  },
  {
    id: "c-fam",
    contactId: "fam",
    isGroup: true,
    unread: 5,
    preview: "Мама: фото с дачи",
    time: "16:05",
    scheduled: { time: "Вс, 12:00", kind: "video" },
    messages: [
      { id: "f1", from: "them", author: "Папа", text: "Яблоки в этом году — во!", time: "15:40" },
      { id: "f2", from: "them", author: "Лена", text: "Привезите хоть ведро", time: "15:48" },
      { id: "f3", from: "me", text: "Я в субботу заеду", time: "15:55", read: true },
      { id: "f4", from: "them", author: "Мама", text: "Фото с дачи", time: "16:05" },
    ],
  },
  {
    id: "c-al",
    contactId: "al",
    unread: 0,
    preview: "Голосовое · 0:34",
    time: "Вчера",
    messages: [
      { id: "a1", from: "me", text: "Как прошло собеседование?", time: "Вчера", read: true },
      { id: "a2", from: "them", text: "Голосовое · 0:34", time: "Вчера" },
    ],
  },
  {
    id: "c-rb",
    contactId: "rb",
    isGroup: true,
    unread: 0,
    preview: "Игорь: релиз в пятницу",
    time: "Вчера",
    messages: [
      { id: "r1", from: "them", author: "Катя", text: "Миграции прогнала на стейдже", time: "Вчера" },
      { id: "r2", from: "me", text: "Отлично, тесты зелёные", time: "Вчера", read: true },
      { id: "r3", from: "them", author: "Игорь", text: "Релиз в пятницу", time: "Вчера" },
    ],
  },
  {
    id: "c-os",
    contactId: "os",
    unread: 0,
    preview: "Пропущенный звонок",
    time: "Пн",
    messages: [
      { id: "o1", from: "them", text: "Пропущенный аудиозвонок", time: "Пн" },
      { id: "o2", from: "me", text: "Перезвоню вечером", time: "Пн", read: false },
    ],
  },
];

export const INITIAL_CALLS: CallRecord[] = [
  { id: "h1", contactId: "mk", kind: "audio", direction: "out", when: "Сегодня, 14:20", duration: "6 мин" },
  { id: "h2", contactId: "dp", kind: "video", direction: "in", when: "Сегодня, 16:58", duration: "12 мин" },
  { id: "h3", contactId: "os", kind: "audio", direction: "missed", when: "Пн, 19:02", duration: "—" },
  { id: "h4", contactId: "fam", kind: "video", direction: "in", when: "Вс, 12:00", duration: "41 мин" },
  { id: "h5", contactId: "al", kind: "audio", direction: "out", when: "Сб, 10:15", duration: "3 мин" },
  { id: "h6", contactId: "ek", kind: "video", direction: "missed", when: "Пт, 20:47", duration: "—" },
];

export const AUTO_REPLIES = [
  "Ага, поняла",
  "Отлично, договорились!",
  "Давай созвонимся, так быстрее",
  "Секунду, посмотрю",
  "Супер",
];
