import { Navigate, Route, Routes, matchPath, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";

import { readBrowserSearch } from "./model/browser.js";
import { useControllerPreview } from "./model/hooks/useControllerPreview.js";
import { useControllerSession } from "./model/hooks/useControllerSession.js";
import { useScreenWakeLock } from "./model/hooks/useScreenWakeLock.js";
import { getRoomFromLocation } from "./model/roomView.js";
import { JoinScreen } from "./screens/JoinScreen/index.js";
import { RoomScreen } from "./screens/RoomScreen/index.js";

export function ControllerApp() {
  const navigate = useNavigate();
  // The path is the router's own state, so it is read from the router. The
  // query is not: half of it is read outside React, so it keeps one source.
  const { pathname } = useLocation();
  const search = readBrowserSearch();
  const preview = useControllerPreview();
  const session = useControllerSession({
    initialRoomCode:
      getRoomFromLocation(search) || (matchPath("/room/:code", pathname)?.params.code ?? ""),
    enabled: preview === undefined,
    onSeated: (roomCode) => {
      // The query carries the preview flag and the debug switches, and the
      // scene reads some of them long after this navigation, so it travels
      // along.
      void navigate(
        { pathname: `/room/${roomCode}`, search: readBrowserSearch() },
        { replace: true }
      );
    },
    onReleased: () => {
      void navigate({ pathname: "/", search: readBrowserSearch() }, { replace: true });
    }
  });
  useScreenWakeLock(session.status === "connected" || session.status === "reconnecting");

  // The display prints ?room=CODE into the QR code, so that link keeps working
  // and turns itself into the room's address once.
  useEffect(() => {
    const legacy = getRoomFromLocation(readBrowserSearch());
    if (legacy.length === 0) return;
    const rest = new URLSearchParams(readBrowserSearch());
    rest.delete("room");
    const kept = rest.toString();
    void navigate(
      { pathname: `/room/${legacy}`, search: kept.length === 0 ? "" : `?${kept}` },
      { replace: true }
    );
  }, []);

  // Two addresses, and the second names a room. Which of the two screens the
  // room's address shows is not the address's business: a cold visit to
  // /room/CODE has no seat yet, so it gets the join form with the code filled
  // in, and the panel appears once the server has seated the player.
  const seated =
    preview !== undefined ||
    (session.status !== "join" &&
      session.status !== "joining" &&
      session.status !== "disconnected");

  const screen = seated ? (
    <RoomScreen
      view={preview?.view ?? session.view}
      currentPlayer={preview === undefined ? session.currentPlayer : preview.currentPlayer}
      status={preview === undefined ? session.status : "connected"}
      error={session.error}
      roomCode={session.roomCode}
      connectionEpoch={session.connectionEpoch}
      errorEpoch={session.errorEpoch}
      preview={preview}
      onReady={session.sendReady}
      onSend={session.sendControl}
      onVote={session.sendUpgradeVote}
      onLeave={() => {
        void session.leaveRoom();
      }}
    />
  ) : (
    <JoinScreen
      roomCode={session.roomCode}
      playerName={session.playerName}
      error={session.error}
      joining={session.status === "joining"}
      onRoomCodeChange={session.setRoomCode}
      onPlayerNameChange={session.setPlayerName}
      onSubmit={() => {
        void session.joinRoom();
      }}
    />
  );

  return (
    <Routes>
      <Route path="/" element={screen} />
      <Route path="/room/:code" element={screen} />
      <Route path="*" element={<Navigate replace to={{ pathname: "/", search }} />} />
    </Routes>
  );
}
