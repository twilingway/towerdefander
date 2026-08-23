function stopOwnedProcess(message) {
  if (message?.type === "stop") process.exit(0);
}

process.on("message", stopOwnedProcess);
process.on("disconnect", () => process.exit(0));
