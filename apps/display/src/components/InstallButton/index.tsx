import { useSyncExternalStore } from "react";

import { installApp, installOffered, subscribeToInstallOffer } from "../../model/appInstall.js";

/**
 * "Install the game" on the start screen, where the browser offers it.
 *
 * The browser's own entry sits in a menu a player does not open; the button
 * says the game can be put on the home screen at all. It disappears once the
 * offer is spent or the game is installed.
 */
export function InstallButton() {
  const offered = useSyncExternalStore(subscribeToInstallOffer, installOffered, () => false);
  if (!offered) return null;
  return (
    <button
      type="button"
      className="update-notice"
      data-testid="install-app"
      onClick={() => {
        void installApp();
      }}
    >
      Установить приложение
    </button>
  );
}
