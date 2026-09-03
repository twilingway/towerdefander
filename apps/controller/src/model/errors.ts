import { ROOM_REFUSED_FOR_MAINTENANCE } from "@spaceship-defender/protocol";

export function toServerError(code: string, fallback: string): string {
  if (code === "invalid_phase") return "Действие недоступно до начала полёта.";
  if (code === "role_mismatch") return "Эта команда недоступна вашей роли.";
  if (code === "identity_mismatch") return "Сервер не подтвердил игровую сессию.";
  if (code === "protocol_mismatch") return "Версия игры устарела. Обновите страницу.";
  if (code === "action_conflict") return "Команда улучшения конфликтует с предыдущей.";
  if (code === "action_not_available") return "Это предложение улучшения уже недоступно.";
  if (code === "stale_action") return "Ваш голос уже обновлён более новой командой.";
  if (code === "stale_run") return "Команда относилась к завершённому бою и не была применена.";
  return fallback;
}

export function toJoinError(reason: unknown): string {
  if (!(reason instanceof Error)) return "Не удалось подключиться к комнате.";
  // A room refused for maintenance never came into existence, so this arrives
  // as matchmaking error text rather than a `server:error` payload.
  if (reason.message.includes(ROOM_REFUSED_FOR_MAINTENANCE)) {
    return "На сервере технические работы. Новые комнаты пока не создаются.";
  }
  if (reason.message.includes("room_full")) return "Все три роли уже заняты.";
  if (reason.message.includes("not found")) return "Комната не найдена. Проверьте код.";
  return reason.message;
}
