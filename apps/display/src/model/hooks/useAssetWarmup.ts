import { useEffect, useState } from "react";

import { warmFightAssets } from "../assetWarmup.js";

/**
 * Whether everything the fight draws and plays has loaded on this page.
 *
 * Started when the app mounts rather than when a lobby opens, so a player who
 * spends a few seconds on the setup screen finds it already done.
 */
export function useAssetWarmup(): boolean {
  const [warm, setWarm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void warmFightAssets().then(() => {
      if (!cancelled) setWarm(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return warm;
}
