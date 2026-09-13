import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isBlockedHost, resolvesToBlockedAddress } from '@/lib/scanner/checks'

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}))

import { lookup as mockedDnsLookup } from 'node:dns/promises'

describe('isBlockedHost — literal IP/hostname rejection', () => {
  it('rejects localhost and its subdomains', () => {
    expect(isBlockedHost('localhost')).toBe(true)
    expect(isBlockedHost('sub.localhost')).toBe(true)
    expect(isBlockedHost('LOCALHOST')).toBe(true)
  })

  it('rejects 0.0.0.0', () => {
    expect(isBlockedHost('0.0.0.0')).toBe(true)
  })

  it('accepts an ordinary public hostname', () => {
    expect(isBlockedHost('example.com')).toBe(false)
    expect(isBlockedHost('www.example.com')).toBe(false)
  })

  it('accepts an ordinary public IPv4 literal', () => {
    expect(isBlockedHost('93.184.216.34')).toBe(false)
    expect(isBlockedHost('8.8.8.8')).toBe(false)
  })

  it('rejects private IPv4 ranges', () => {
    expect(isBlockedHost('127.0.0.1')).toBe(true)
    expect(isBlockedHost('10.0.0.1')).toBe(true)
    expect(isBlockedHost('10.255.255.255')).toBe(true)
    expect(isBlockedHost('192.168.1.1')).toBe(true)
    expect(isBlockedHost('172.16.0.1')).toBe(true)
    expect(isBlockedHost('172.31.255.255')).toBe(true)
    // 172.15.x/172.32.x are outside the RFC1918 172.16-31 block and must NOT be blocked
    expect(isBlockedHost('172.15.0.1')).toBe(false)
    expect(isBlockedHost('172.32.0.1')).toBe(false)
  })

  it('rejects the AWS/GCP/Azure link-local cloud metadata address', () => {
    expect(isBlockedHost('169.254.169.254')).toBe(true)
    expect(isBlockedHost('169.254.0.1')).toBe(true)
  })

  it('rejects CGNAT, benchmarking, and TEST-NET/reserved/multicast ranges', () => {
    expect(isBlockedHost('100.64.0.1')).toBe(true)
    expect(isBlockedHost('100.127.255.255')).toBe(true)
    expect(isBlockedHost('198.18.0.1')).toBe(true)
    expect(isBlockedHost('192.0.2.1')).toBe(true)
    expect(isBlockedHost('198.51.100.1')).toBe(true)
    expect(isBlockedHost('203.0.113.1')).toBe(true)
    expect(isBlockedHost('224.0.0.1')).toBe(true)
    expect(isBlockedHost('240.0.0.1')).toBe(true)
  })

  it('rejects IPv6 loopback and unspecified', () => {
    expect(isBlockedHost('::1')).toBe(true)
    expect(isBlockedHost('::')).toBe(true)
  })

  it('rejects IPv6 link-local (fe80::/10)', () => {
    expect(isBlockedHost('fe80::1')).toBe(true)
    expect(isBlockedHost('fe80::abcd:1234')).toBe(true)
  })

  it('rejects IPv6 unique-local/ULA (fc00::/7)', () => {
    expect(isBlockedHost('fc00::1')).toBe(true)
    expect(isBlockedHost('fd12:3456:789a::1')).toBe(true)
  })

  it('rejects IPv6 multicast (ff00::/8)', () => {
    expect(isBlockedHost('ff02::1')).toBe(true)
  })

  it('rejects IPv4-mapped IPv6 addresses whose embedded IPv4 is private', () => {
    expect(isBlockedHost('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedHost('::ffff:169.254.169.254')).toBe(true)
  })

  it('accepts an ordinary public IPv6 address', () => {
    expect(isBlockedHost('2606:4700:4700::1111')).toBe(false)
  })
})

describe('resolvesToBlockedAddress — DNS-resolving check', () => {
  beforeEach(() => {
    vi.mocked(mockedDnsLookup).mockReset()
  })

  it('returns "ok" for a literal public IP without calling DNS', async () => {
    const result = await resolvesToBlockedAddress('8.8.8.8')
    expect(result).toBe('ok')
    expect(mockedDnsLookup).not.toHaveBeenCalled()
  })

  it('returns "blocked" for a literal private IP without calling DNS', async () => {
    const result = await resolvesToBlockedAddress('127.0.0.1')
    expect(result).toBe('blocked')
    expect(mockedDnsLookup).not.toHaveBeenCalled()
  })

  it('returns "ok" when every resolved address is public', async () => {
    vi.mocked(mockedDnsLookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never)
    expect(await resolvesToBlockedAddress('example.com')).toBe('ok')
  })

  it('returns "blocked" when a hostname resolves to a private/internal address (the core hostname-rebinding-style gap this closes)', async () => {
    vi.mocked(mockedDnsLookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never)
    expect(await resolvesToBlockedAddress('attacker-controlled.example')).toBe('blocked')
  })

  it('returns "blocked" if ANY of multiple resolved addresses is private, even if others are public', async () => {
    vi.mocked(mockedDnsLookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ] as never)
    expect(await resolvesToBlockedAddress('multi-a-record.example')).toBe('blocked')
  })

  it('returns "unresolvable" when DNS lookup throws', async () => {
    vi.mocked(mockedDnsLookup).mockRejectedValue(new Error('ENOTFOUND'))
    expect(await resolvesToBlockedAddress('does-not-exist.invalid')).toBe('unresolvable')
  })

  it('returns "unresolvable" when DNS lookup returns zero addresses', async () => {
    vi.mocked(mockedDnsLookup).mockResolvedValue([] as never)
    expect(await resolvesToBlockedAddress('empty-answer.example')).toBe('unresolvable')
  })
})
