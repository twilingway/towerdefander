import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";

import { GAME_SERVER_URL } from "./model/environment.js";
import { useDiagnosticsMeters } from "./model/hooks/useDiagnosticsMeters.js";
import { useDisplaySwitches } from "./model/hooks/useDisplaySwitches.js";
import { useRoomSession } from "./model/hooks/useRoomSession.js";
import { useAssetWarmup } from "./model/hooks/useAssetWarmup.js";
import { useRuntimePreload } from "./model/hooks/useRuntimePreload.js";
import { useMaintenance, useShipCatalogue } from "./model/hooks/useServerStatus.js";
import { readPilotName, rememberPilotName } from "./model/pilotName.js";
import { readDisplaySearch, readDisplayUrlFlags, withRunParameters } from "./model/urlFlags.js";
import { ArenaSetupScreen } from "./screens/ArenaSetupScreen/index.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen/index.js";
import { LocalRunRoute } from "./screens/RoomScreen/LocalRunRoute.js";
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
  const runtimeReady = useRuntimePreload();
  // The pictures and the sounds as well as the renderer's code: a fight that
  // began on the code alone began with shots nobody could hear.
  const assetsWarm = useAssetWarmup();
  const worldReady = runtimeReady && assetsWarm;
  const session = useRoomSession(flags.visibleDemo, assetsWarm);
  /*
   * A page hosting its own run asks the server nothing at all - not the hull
   * catalogue, not the maintenance window. It has a preset of its own, and a
   * mode that plays without a server must not depend on one answering.
   */
  const hostedLocally = useLocation().pathname === "/solo";

  const shipCatalogue = useShipCatalogue(GAME_SERVER_URL, !hostedLocally);
  const maintenance = useMaintenance(
    GAME_SERVER_URL,
    hostedLocally || session.status === "connected"
  );
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
  /*
   * A page that hosts its own run holds no room.
   *
   * Leaving one behind is not idle: the create screen sends anyone with a live
   * session straight back into it, so "Выйти" from a local run landed the
   * player in a networked room they had opened minutes ago.
   */
  useEffect(() => {
    if (hostedLocally && seated) void session.leaveRoom();
  }, [hostedLocally, seated, session]);

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
        sharedScreen={flags.sharedScreen}
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
      sharedScreen={flags.sharedScreen}
      allowStartWave={flags.allowStartWave}
      initialStartWave={flags.initialStartWave}
      ships={shipCatalogue?.ships ?? []}
      defaultShipId={flags.shipArchetypeId ?? shipCatalogue?.defaultShipId}
      initialPlace={flags.online ? "server" : "device"}
      onCreate={(crewSize, shipArchetypeId, startWave, cockpitPlayerName, hostedLocally) => {
        /*
         * The device tile is hosted by the page, so it goes to its own address
         * and asks nothing of a server. The server tile opens a room for one,
         * the way solo always used to play; `?online` preselects it, so a
         * room-side bug is still reproduced from a bookmark.
         */
        if (cockpitPlayerName !== undefined && hostedLocally) {
          rememberPilotName(cockpitPlayerName);
          void navigate({
            pathname: "/solo",
            search: withRunParameters(readDisplaySearch(), { shipArchetypeId, startWave })
          });
          return;
        }
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

  /*
   * The campaign hosted by this page. Its own address rather than a room's:
   * `/room/:code` names a room on a server, and this run has neither.
   */
  const soloRoute = (
    <LocalRunRoute
      diagnostics={flags.diagnostics}
      visibleDemo={flags.visibleDemo}
      switches={switches}
      worldReady={worldReady}
      shipArchetypeId={flags.shipArchetypeId}
      playerName={readPilotName()}
      startWave={flags.initialStartWave}
      onLeave={() => {
        // Back to the campaign setup, hull kept, by the operator's call on
        // 2026-09-22: leaving a run is a step back, not a return to the modes.
        void navigate({ pathname: "/campaign", search: readDisplaySearch() });
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
      cockpit={
        session.cockpitPlayer === undefined
          ? undefined
          : {
              playerId: session.sessionId,
              generation: session.connectionEpoch,
              seat: session.cockpitSeat,
              send: (type, payload) => {
                session.room?.send(type, payload);
              }
            }
      }
      preview={undefined}
      onCloseRoom={() => {
        /*
         * Back to the campaign's lobby with the same hull, as a local run does:
         * whoever closed a room wants the next one, and the lobby is where the
         * crew, the place and the ship are chosen. An arena room goes back to
         * its own queue instead. Read before closing - the session forgets both.
         */
        const lobby = session.arenaLobby === undefined ? "/campaign" : "/arena";
        const search = withRunParameters(readDisplaySearch(), {
          shipArchetypeId: session.view?.shipArchetypeId,
          startWave: 1
        });
        void session.closeRoom().then(() => {
          void navigate({ pathname: lobby, search }, { replace: true });
        });
      }}
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
      <Route path="/solo" element={soloRoute} />
      <Route path="/room/:code" element={roomRoute} />
      <Route
        path="*"
        element={<Navigate replace to={{ pathname: "/", search: readDisplaySearch() }} />}
      />
    </Routes>
  );
}
