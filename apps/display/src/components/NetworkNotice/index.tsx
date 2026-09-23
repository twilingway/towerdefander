import { appUpdateAvailable, applyAppUpdate } from "../../model/appUpdate.js";
import type { NetworkClosure } from "../../model/serverStatus.js";

type NetworkProblem = Exclude<NetworkClosure, "maintenance">;

/** What went wrong, the same on every screen. */
const CAUSES: Readonly<Record<NetworkProblem, string>> = {
  offline: "Нет подключения к интернету",
  unreachable: "Сервер игры не отвечает",
  outdated: "Сервер уже на новой версии игры — обновите игру, чтобы играть по сети"
};

/**
 * What is still open, said in the terms of the screen: the start screen offers
 * modes, of which the campaign is the one that needs no server; the campaign
 * screen offers places, of which this device is that one.
 */
const STILL_OPEN = {
  start: "доступна только кампания",
  campaign: "играть можно только на этом устройстве"
} as const;

/**
 * Why the network tiles are dimmed, above them, where the maintenance notice
 * stands in its own case. For a server on a newer protocol it carries the way
 * out: the waiting build if the worker has one, else a reload - pages come
 * from the network first, so a reload brings the new build either way.
 */
export function NetworkNotice({
  closure,
  screen
}: {
  readonly closure: NetworkProblem;
  readonly screen: keyof typeof STILL_OPEN;
}) {
  return (
    <div className="network-notice" role="status" data-testid="network-notice">
      <p>
        {CAUSES[closure]}, {STILL_OPEN[screen]}.
      </p>
      {closure === "outdated" && (
        <button
          type="button"
          className="update-notice"
          data-testid="network-update"
          onClick={() => {
            if (appUpdateAvailable()) applyAppUpdate();
            else globalThis.location.reload();
          }}
        >
          Обновить
        </button>
      )}
    </div>
  );
}
