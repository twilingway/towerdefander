import { useSyncExternalStore } from "react";

import { appUpdateAvailable, applyAppUpdate, subscribeToAppUpdate } from "../../model/appUpdate.js";

/**
 * "A new version is ready" - on the screens between fights and nowhere else.
 *
 * The fight never renders this, which is what makes a release unable to
 * reload a page mid-wave: the build waits in the background until the player
 * is somewhere a reload costs nothing, and presses.
 */
export function UpdateNotice() {
  const available = useSyncExternalStore(subscribeToAppUpdate, appUpdateAvailable, () => false);
  if (!available) return null;
  return (
    <button
      type="button"
      className="update-notice"
      data-testid="update-notice"
      onClick={applyAppUpdate}
    >
      Есть новая версия — обновить
    </button>
  );
}
