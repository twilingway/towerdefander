import { Navigate, Route, Routes, useNavigate } from "react-router";

import { GAME_SERVER_URL } from "./model/environment.js";
import { useDiagnosticsMeters } from "./model/hooks/useDiagnosticsMeters.js";
import { useDisplaySwitches } from "./model/hooks/useDisplaySwitches.js";
import { useRoomSession } from "./model/hooks/useRoomSession.js";
import { useRuntimePreload } from "./model/hooks/useRuntimePreload.js";
import { useMaintenance, useShipCatalogue } from "./model/hooks/useServerStatus.js";
import { readDisplaySearch, readDisplayUrlFlags } from "./model/urlFlags.js";
import { ArenaSetupScreen } from "./screens/ArenaSetupScreen/index.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { PreviewRoomRoute } from "./screens/RoomScreen/PreviewRoomRoute.js";
import { RoomScreen } from "./screens/RoomScreen/index.js";
import { StartScreen } from "./screens/StartScreen/index.js";

export function DisplayApp() {
  // The query is the whole configuration surface, and it keeps one reader: half
  // of it (?dpr, ?tanks) is read outside React, in the canvas and in the scene,
  // so router state must never become a second source for any of it.
  const flags = readDisplayUrlFlags(readDisplaySearch(), {
    dev: import.meta.env.DEV,
    visibleDemo: import.meta.env.VITE_VISIBLE_DEMO
  });
  const switches = useDisplaySwitches();
  const worldReady = useRuntimePreload();
  const session = useRoomSession(flags.visibleDemo);
  const shipCatalogue = useShipCatalogue(GAME_SERVER_URL);
  const maintenance = useMaintenance(GAME_SERVER_URL, session.status === "connected");
  useDiagnosticsMeters({
    enabled: flags.diagnostics,
    readSocket: session.readSocket,
    connectionEpoch: session.connectionEpoch,
    status: session.status
  });

  const navigate = useNavigate();
  const seated =
    (session.status === "connected" || session.status === "reconnecting") &&
    session.view !== undefined;

  // The mode grid is the front door, and the campaign setup is a screen of its
  // own behind it: two games, not one game with a switch on it.
  const startRoute = seated ? (
    <Navigate
      replace
      to={{ pathname: `/room/${session.view.roomId}`, search: readDisplaySearch() }}
    />
  ) : (
    <StartScreen
      maintenance={maintenance}
      onPick={(mode) => {
        void navigate({
          pathname: mode === "arena" ? "/arena" : "/campaign",
          search: readDisplaySearch()
        });
      }}
    />
  );

  // The queue holds this screen until the server says the match began.
  const arenaRoute =
    seated && session.arenaLobby?.started === true ? (
      <Navigate
        replace
        to={{ pathname: `/room/${session.view.roomId}`, search: readDisplaySearch() }}
      />
    ) : (
      <ArenaSetupScreen
        ships={shipCatalogue?.ships ?? []}
        defaultShipId={flags.shipArchetypeId ?? shipCatalogue?.defaultShipId}
        status={session.status}
        error={session.error}
        lobby={session.arenaLobby}
        onBack={() => {
          void navigate({ pathname: "/", search: readDisplaySearch() });
        }}
        onStart={(cockpitPlayerName) => {
          // The room opens as a waiting room, so the screen stays put: the match
          // page is for a match, and this is a queue people are still joining.
          //
          // The name has to travel: it is what makes the connection a cockpit
          // rather than a spectator, and dropping it here was the whole of "a
          // bot flies my ship" - the room seated nobody and the sticks never
          // armed, because neither side had been told anyone was flying.
          void session.createArenaMatch(cockpitPlayerName);
        }}
      />
    );

  const createRoute = seated ? (
    <Navigate
      replace
      to={{ pathname: `/room/${session.view.roomId}`, search: readDisplaySearch() }}
    />
  ) : (
    <CreateRoomScreen
      maintenance={maintenance}
      onBack={() => {
        void navigate({ pathname: "/", search: readDisplaySearch() });
      }}
      status={session.status}
      error={session.error}
      visibleDemo={flags.visibleDemo}
      allowStartWave={flags.allowStartWave}
      initialStartWave={flags.initialStartWave}
      ships={shipCatalogue?.ships ?? []}
      defaultShipId={flags.shipArchetypeId ?? shipCatalogue?.defaultShipId}
      onCreate={(crewSize, shipArchetypeId, startWave, cockpitPlayerName) => {
        void session
          .createRoom(crewSize, shipArchetypeId, startWave, cockpitPlayerName)
          .then((roomId) => {
            if (roomId === undefined) return;
            // The query carries ?diag, ?demo, ?tanks and ?dpr, and the scene
            // reads the last two only when it is built - which is after this
            // navigation. Dropping the query here would silently unarm every
            // measuring stand.
            void navigate(
              { pathname: `/room/${roomId}`, search: readDisplaySearch() },
              { replace: true }
            );
          });
      }}
    />
  );

  const previewRoute = (
    <PreviewRoomRoute
      diagnostics={flags.diagnostics}
      visibleDemo={flags.visibleDemo}
      switches={switches}
      worldReady={worldReady}
      ships={shipCatalogue?.ships}
    />
  );

  // A cold visit to a room's address has no connection to it, and one cannot be
  // restored from a URL: the display creates rooms, it does not join them. So
  // the address falls back to the create screen rather than showing nothing.
  const roomRoute = seated ? (
    <RoomScreen
      view={session.view}
      diagnostics={flags.diagnostics}
      visibleDemo={flags.visibleDemo}
      switches={switches}
      worldReady={worldReady}
      ships={shipCatalogue?.ships}
      session={session}
      preview={undefined}
      onCloseRoom={() => void session.closeRoom()}
      onLeaveRoom={() => {
        // Back to the queue rather than to the front door: somebody who has
        // just been shot down wants the next match, not the mode grid.
        void session.leaveRoom().then(() => {
          void navigate({ pathname: "/arena", search: readDisplaySearch() }, { replace: true });
        });
      }}
      onScan={session.sendArenaScan}
      onReady={session.sendCockpitReady}
      onVote={session.sendCockpitVote}
    />
  ) : (
    <Navigate replace to={{ pathname: "/", search: readDisplaySearch() }} />
  );

  return (
    <Routes>
      <Route path="/" element={flags.preview ? previewRoute : startRoute} />
      <Route path="/campaign" element={flags.preview ? previewRoute : createRoute} />
      <Route path="/arena" element={flags.preview ? previewRoute : arenaRoute} />
      <Route path="/preview" element={flags.preview ? previewRoute : createRoute} />
      <Route path="/room/:code" element={roomRoute} />
      <Route
        path="*"
        element={<Navigate replace to={{ pathname: "/", search: readDisplaySearch() }} />}
      />
    </Routes>
  );
}
