function stopOwnedProcess(message) {
  if (message?.type === "stop") process.exit(0);
}

process.on("message", stopOwnedProcess);
process.on("disconnect", () => process.exit(0));
// Listening on the channel refs it, and a ref'd channel keeps the event loop
// alive: a harness that finished its work sat there forever instead of exiting,
// so whoever spawned it never saw it end. The console showed a batch still
// running long after its report was written. Unref'd the channel still delivers
// the stop message; it just stops being a reason to stay.
process.channel?.unref();
