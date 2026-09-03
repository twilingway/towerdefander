import type { RoomClosingReason } from "@spaceship-defender/protocol";

export interface ClosableDisplayRoom {
  reconnection: { enabled: boolean };
  leave(consented: boolean): Promise<number>;
}

export const CLOSE_ROOM_CONFIRMATION =
  "Закрыть комнату для всех игроков? Текущий результат и подключения будут потеряны.";

export function confirmDisplayRoomClose(confirmAction: (message: string) => boolean): boolean {
  return confirmAction(CLOSE_ROOM_CONFIRMATION);
}

export async function closeDisplayRoom(room: ClosableDisplayRoom): Promise<void> {
  room.reconnection.enabled = false;
  await room.leave(true);
}

export function roomClosingMessage(reason: RoomClosingReason): string {
  switch (reason) {
    case "display_left":
      return "Комната закрыта общим экраном.";
    case "display_reconnect_expired":
      return "Общий экран не успел переподключиться, поэтому комната закрыта.";
    case "lobby_expired":
      return "Комната закрыта: экипаж не собрался вовремя.";
    case "result_expired":
      return "Комната закрыта: время на повторный забег истекло.";
    case "controllers_expired":
      return "Комната закрыта: игроки слишком долго отсутствовали.";
    case "room_lifetime_expired":
      return "Комната достигла максимального времени работы и закрыта.";
    case "maintenance_window":
      return "Забег окончен, а на сервере начинаются технические работы. Комната закрыта.";
  }
}
