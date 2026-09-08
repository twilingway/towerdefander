import {
  ROOM_REFUSED_AT_CAPACITY,
  ROOM_REFUSED_FOR_MAINTENANCE
} from "@spaceship-defender/protocol";

/** Turns a refused room into the one sentence the shared screen shows. */
export function createFailureMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return "Не удалось создать комнату.";
  if (reason.message === ROOM_REFUSED_FOR_MAINTENANCE) {
    return "На сервере технические работы. Новые комнаты пока не создаются.";
  }
  if (reason.message === ROOM_REFUSED_AT_CAPACITY) {
    return "Сервер занят: свободных комнат нет. Попробуйте через минуту.";
  }
  if (reason.message === "protocol_mismatch") {
    return "Версия игры устарела. Обновите страницу.";
  }
  return reason.message;
}
