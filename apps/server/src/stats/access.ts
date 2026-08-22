import { createHash, timingSafeEqual } from "node:crypto";

const MAX_AUTHORIZATION_HEADER_LENGTH = 1_024;

export interface StatsAccessRequest {
  headers: {
    authorization?: string | string[] | undefined;
  };
  socket: {
    remoteAddress?: string | undefined;
  };
}

function isConstantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) {
    return false;
  }

  const normalizedAddress = address.toLowerCase();
  if (normalizedAddress === "::1") {
    return true;
  }

  const ipv4Address = normalizedAddress.startsWith("::ffff:")
    ? normalizedAddress.slice("::ffff:".length)
    : normalizedAddress;
  const octets = ipv4Address.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => {
      if (!/^\d{1,3}$/.test(octet)) {
        return false;
      }

      const value = Number(octet);
      return value >= 0 && value <= 255;
    })
  );
}

function readBasicCredentials(header: string | string[] | undefined): {
  username: string;
  password: string;
} {
  if (
    typeof header !== "string" ||
    header.length > MAX_AUTHORIZATION_HEADER_LENGTH ||
    !/^Basic\s+/i.test(header)
  ) {
    return { username: "", password: "" };
  }

  const encodedCredentials = header.replace(/^Basic\s+/i, "");
  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
  const separatorIndex = decodedCredentials.indexOf(":");
  if (separatorIndex < 0) {
    return { username: "", password: "" };
  }

  return {
    username: decodedCredentials.slice(0, separatorIndex),
    password: decodedCredentials.slice(separatorIndex + 1)
  };
}

export function isStatsRequestAuthorized(
  request: StatsAccessRequest,
  password: string | undefined
): boolean {
  if (password === undefined) {
    return isLoopbackAddress(request.socket.remoteAddress);
  }

  const credentials = readBasicCredentials(request.headers.authorization);
  const usernameMatches = isConstantTimeEqual(credentials.username, "admin");
  const passwordMatches = isConstantTimeEqual(credentials.password, password);
  return usernameMatches && passwordMatches;
}
