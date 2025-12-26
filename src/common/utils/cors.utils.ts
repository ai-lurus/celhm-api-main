/**
 * Utility functions for CORS configuration
 */

/**
 * Checks if an origin is a local network address
 * @param origin - The origin URL to check
 * @returns true if the origin is a local network address (localhost, 127.0.0.1, or private IP ranges)
 */
export function isLocalNetworkOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Allow localhost and 127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    // Allow private network IP ranges
    // 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12
    const ipParts = hostname.split('.').map(Number);
    if (ipParts.length === 4 && ipParts.every(part => !isNaN(part))) {
      const [a, b] = ipParts;
      if (a === 192 && b === 168) return true; // 192.168.x.x
      if (a === 10) return true; // 10.x.x.x
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16-31.x.x
    }

    return false;
  } catch {
    return false;
  }
}

