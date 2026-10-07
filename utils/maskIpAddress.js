const { isIP } = require('node:net');

function maskIpAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // PostgreSQL inet::text includes a prefix (usually /32 or /128). Remove it
  // before validating and masking the address; never pass the original value
  // through when parsing fails.
  const address = value.trim().split('/')[0];

  if (isIP(address) === 4) {
    const octets = address.split('.');
    return `${octets.slice(0, 3).join('.')}.xxx`;
  }

  if (isIP(address) !== 6) return 'Masked';

  const withoutZone = address.split('%')[0];
  let source = withoutZone;
  const embeddedIpv4 = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embeddedIpv4) {
    const octets = embeddedIpv4[1].split('.').map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    source = source.slice(0, -embeddedIpv4[1].length) + `${high}:${low}`;
  }

  const halves = source.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missingGroups = Math.max(0, 8 - left.length - right.length);
  const groups = [...left, ...Array(missingGroups).fill('0'), ...right];
  const visible = groups.slice(0, 3);
  return [...visible, ...Array(8 - visible.length).fill('xxxx')].join(':');
}

function serializeAdminSession(session) {
  return { ...session, ip_address: maskIpAddress(session.ip_address) };
}

module.exports = { maskIpAddress, serializeAdminSession };
